"""
================================================================================
DOCUMENTACIÓN GENERAL: Monitor de Disponibilidad CCTV (Hikvision ISAPI)
================================================================================

1. DESCRIPCIÓN
   Consulta periódica al endpoint del NVR:
     GET /ISAPI/ContentMgmt/InputProxy/channels/status

2. COMPATIBILIDAD CON cctv-scanner
   Usa la misma configuración que cctv-scanner:
     - .env                        : NVR_USER / NVR_PASS (y MONITOR_MINUTOS, MONITOR_ESTRICTO).
     - cctv-scanner-config.json    : Lista de NVRs, "opcion_puerto" (1 a 5), salida.
     - datos/cctv_online.json      : Mapeo Channel ID -> Nombre/IP (se recarga solo si cambia).
   Un JSON viejo, sin ningún campo nuevo, funciona igual que antes (modo COMPATIBLE).

3. CAMPOS OPCIONALES EN cctv-scanner-config.json
   Globales:
     "monitor_minutos" : intervalo de consulta (default 5).
     "ruta_salida"     : {"carpeta": "..."} para cctv_monitor.log.
     "modo_estricto"   : true -> exige huella TLS y prohíbe HTTP y Basic salvo que se
                         habiliten a mano por NVR (ver abajo).
   Por NVR (dentro de "nvrs"):
     "tls_sha256"      : huella SHA-256 del certificado (o usar --fijar-huellas).
     "permitir_basic"  : true/false. Autenticación Basic solo si el NVR la exige.
     "permitir_http"   : true/false. Permite el fallback a HTTP:80.
     "puerto_https" / "puerto_http" : puertos no estándar.
   Ejemplo:
     "nvrs": [
       {"ip": "10.0.0.11", "tls_sha256": "AB:CD:...:EF"},
       {"ip": "10.0.0.12", "permitir_basic": true, "permitir_http": true}
     ]

4. MODOS DE SEGURIDAD
   COMPATIBLE (default): mismo comportamiento que la versión anterior. Un NVR con huella
     fijada pasa a canal verificado: si la huella no coincide NO se envían credenciales,
     y HTTP solo se usa si el NVR tiene "permitir_http": true.
   ESTRICTO (--estricto, "modo_estricto": true o MONITOR_ESTRICTO=1): un NVR sin huella no
     se consulta. HTTP y Basic quedan deshabilitados salvo habilitación explícita.

5. USO
   python cctv-monitor.py                    Monitor continuo.
   python cctv-monitor.py --fijar-huellas    Lee y guarda las huellas TLS de los NVR
                                             (hacelo desde una red de confianza).
   python cctv-monitor.py --una-vez          Una sola pasada y salir (cron/pruebas).
   Salir: Ctrl + C.
================================================================================
"""

import os
import sys


def pausar(msg="\nPresioná Enter para salir..."):
    """Pausa solo si hay una consola interactiva (no cuelga como servicio o tarea)."""
    try:
        if sys.stdin and sys.stdin.isatty():
            input(msg)
    except (EOFError, OSError):
        pass


import ssl
import json
import math
import time
import socket
import hashlib
import logging
import datetime
import warnings
import re
import ipaddress
import argparse
import threading
import traceback
import xml.etree.ElementTree as ET
from logging.handlers import RotatingFileHandler

# Silenciar advertencias de SSL/TLS (compatibilidad con equipos legacy)
warnings.filterwarnings("ignore", category=DeprecationWarning, module="ssl")

try:
    import requests
    import urllib3
    from requests.adapters import HTTPAdapter
    from requests.auth import HTTPDigestAuth, HTTPBasicAuth
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    print("[ERROR FATAL] Falta la librería 'requests'. Ejecutá: pip install requests")
    pausar()
    sys.exit(1)

try:
    import keyring
    HAS_KEYRING = True
except ImportError:
    HAS_KEYRING = False

# Rutas base
_DIR_BASE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
ARCHIVO_CONFIG = os.path.join(_DIR_BASE, "cctv-scanner-config.json")
ARCHIVO_ENV    = os.path.join(_DIR_BASE, ".env")
ARCHIVO_ONLINE = os.path.join(_DIR_BASE, "datos", "cctv_online.json")
ARCHIVO_PINS   = os.path.join(_DIR_BASE, "cctv-monitor-pins.json")

CARPETA_DATOS_DEFAULT = "datos"
ARCHIVO_MONITOR_LOG_DEFAULT = "cctv_monitor.log"

# Límites y tiempos
TIMEOUT_NVR = (3.0, 5.0)            # (conexión, lectura) por operación de red
TIMEOUT_TOTAL_NVR = 25.0            # tope total por NVR (toda la cadena de protocolos)
MAX_BYTES_RESPUESTA = 2 * 1024 * 1024
MAX_HILOS = 10
COOLDOWN_AUTH_S = 1800              # pausa tras credenciales rechazadas (evita bloqueos)
MAX_LOG_BYTES = 5 * 1024 * 1024
MAX_ERRORES_SEGUIDOS = 10

MSG_AUTH = "AUTH: credenciales rechazadas (HTTP 401)"
MSG_AUTH_PAUSA = "AUTH (pausa): credenciales rechazadas, se reintenta más tarde para no bloquear la cuenta"


class ErrorFatal(Exception):
    pass


# ---------------------------------------------------------------------------
# UTILIDADES DE SANEAMIENTO
# ---------------------------------------------------------------------------
_RE_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]")
_RE_CANAL = re.compile(r"\d{1,5}")
_RE_HOST = re.compile(r"[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?")


def limpiar_texto(texto, max_len=200):
    """Quita caracteres de control (incluye ESC, saltos de línea, bidi) y acota el largo."""
    if texto is None:
        return "N/A"
    limpio = _RE_CONTROL.sub("", str(texto)).strip()
    if not limpio:
        return "N/A"
    return limpio[:max_len]


def host_valido(h):
    try:
        ipaddress.ip_address(h)
        return True
    except ValueError:
        return bool(_RE_HOST.fullmatch(h))


def _tri_bool(valor):
    """True / False / None (no definido). Acepta bool, 0/1 y textos comunes."""
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, int):
        return bool(valor)
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ("1", "true", "si", "sí", "yes", "s", "y"):
            return True
        if v in ("0", "false", "no", "n"):
            return False
    return None


def _puerto(valor, defecto):
    try:
        p = int(valor)
        return str(p) if 1 <= p <= 65535 else defecto
    except (TypeError, ValueError):
        return defecto


def normalizar_huella(valor):
    h = re.sub(r"[:\s-]", "", str(valor)).lower()
    if not re.fullmatch(r"[0-9a-f]{64}", h):
        raise ValueError("se esperan 64 caracteres hexadecimales (SHA-256)")
    return h


def formatear_huella(h):
    return ":".join(h[i:i + 2] for i in range(0, len(h), 2)).upper()


# ---------------------------------------------------------------------------
# ADAPTADORES TLS (compatibles con equipos legacy) + FIJADO DE HUELLA
# ---------------------------------------------------------------------------
_TLS13_SUPPORTED = hasattr(ssl, 'TLSVersion') and hasattr(ssl.TLSVersion, 'TLSv1_3')


def crear_contexto(tipo):
    """Contexto TLS por perfil. La identidad del NVR se valida por huella, no por CA."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    if tipo == "https_tls13":
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    elif tipo == "https_modern":
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    elif tipo == "https_legacy":
        try:
            ctx.minimum_version = ssl.TLSVersion.TLSv1
        except (AttributeError, ValueError):
            pass
        try:
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')
        except ssl.SSLError:
            pass
    return ctx


class PinnedAdapter(HTTPAdapter):
    """Adaptador HTTPS: contexto por perfil y, si hay huella, la verifica en el handshake
    (antes de enviar cualquier credencial)."""

    def __init__(self, tipo, huella=None, **kw):
        self._tipo = tipo            # atributos antes de super().__init__
        self._huella = huella
        super().__init__(**kw)

    def init_poolmanager(self, *args, **kwargs):
        kwargs['ssl_context'] = crear_contexto(self._tipo)
        if self._huella:
            kwargs['assert_fingerprint'] = self._huella
        return super().init_poolmanager(*args, **kwargs)


def crear_adapter(tipo, huella):
    """Un adaptador NUEVO por sesión (no se comparten entre hilos)."""
    if tipo == "http":
        return HTTPAdapter()
    return PinnedAdapter(tipo, huella)


_HTTPS_CHAIN = (
    [("https_tls13", "443")] if _TLS13_SUPPORTED else []
) + [("https_modern", "443"), ("https_legacy", "443")]

OPCIONES_PUERTOS = {
    "1": _HTTPS_CHAIN + [("http", "80")],
    "2": [("https_modern", "443"), ("https_legacy", "443"), ("http", "80")],
    "3": [("https_modern", "443"), ("http", "80")],
    "4": _HTTPS_CHAIN,
    "5": [("http", "80")]
}


def obtener_huella_sha256(host, puerto=443, timeout=5.0):
    """Lee el certificado que presenta el NVR y devuelve su SHA-256 (hex minúscula)."""
    ultimo = None
    for tipo in ("https_modern", "https_legacy"):
        try:
            ctx = crear_contexto(tipo)
            with socket.create_connection((host, int(puerto)), timeout=timeout) as s:
                with ctx.wrap_socket(s) as ss:
                    der = ss.getpeercert(binary_form=True)
            return hashlib.sha256(der).hexdigest()
        except Exception as e:
            ultimo = e
    raise ultimo


# ---------------------------------------------------------------------------
# CARGA DE .ENV Y CONFIGURACIÓN
# ---------------------------------------------------------------------------
# Solo estas claves se importan desde .env: no se puede alterar PATH, proxies, CA, etc.
_ENV_PERMITIDAS = {
    "NVR_USER", "NVR_PASS", "CCTV_USER", "CCTV_PASS",
    "MONITOR_MINUTOS", "INTERVALO_MINUTOS", "MONITOR_ESTRICTO",
}


def cargar_env():
    if not os.path.isfile(ARCHIVO_ENV):
        return

    ignoradas = []
    for enc in ("utf-8-sig", "utf-16", "utf-8", "latin-1"):
        try:
            with open(ARCHIVO_ENV, "r", encoding=enc) as f:
                lineas = f.readlines()
                if not any("=" in l for l in lineas):
                    continue
                for linea in lineas:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    if linea.lower().startswith("export "):
                        linea = linea[7:].strip()
                    clave, valor = linea.split("=", 1)
                    clave, valor = clave.strip(), valor.strip()
                    if len(valor) >= 2 and ((valor.startswith('"') and valor.endswith('"')) or (valor.startswith("'") and valor.endswith("'"))):
                        valor = valor[1:-1]
                    if not clave:
                        continue
                    if clave.upper() in _ENV_PERMITIDAS:
                        os.environ[clave.upper()] = valor
                    else:
                        ignoradas.append(limpiar_texto(clave, 40))
                break
        except Exception:
            continue

    if ignoradas:
        print(f"[INFO] .env: se ignoraron {len(ignoradas)} claves que el monitor no usa "
              f"({', '.join(ignoradas[:5])}{'...' if len(ignoradas) > 5 else ''}).")


def cargar_config():
    if not os.path.isfile(ARCHIVO_CONFIG):
        return {}
    try:
        with open(ARCHIVO_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"[WARN] Error al leer config JSON: {e}")
        return {}


def cargar_pins():
    if not os.path.isfile(ARCHIVO_PINS):
        return {}
    try:
        with open(ARCHIVO_PINS, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {str(k).strip(): v for k, v in data.items()} if isinstance(data, dict) else {}
    except Exception as e:
        print(f"[WARN] No se pudo leer {ARCHIVO_PINS}: {e}")
        return {}


def guardar_pins(pins):
    tmp = ARCHIVO_PINS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(pins, f, indent=2, sort_keys=True)
    if os.name == "posix":
        os.chmod(tmp, 0o600)
    os.replace(tmp, ARCHIVO_PINS)


def _env(nombre):
    return os.environ.get(nombre) or os.environ.get(nombre.lower())


def resolver_credenciales(config_data):
    """Devuelve (usuario, contraseña, origen). Orden idéntico al de la versión anterior."""
    origen = None
    user = _env("NVR_USER") or _env("CCTV_USER")
    if not user and config_data:
        user = config_data.get("nvr_user")
    if user:
        user = str(user).strip()

    password = _env("NVR_PASS") or _env("CCTV_PASS")
    if password:
        password = str(password).strip()
        origen = "entorno/.env"

    if not password and config_data:
        json_pass = config_data.get("nvr_pass")
        if json_pass:
            password = str(json_pass).strip()
            origen = "JSON (texto plano)"

    if not password and HAS_KEYRING and user:
        try:
            password = keyring.get_password("CCTV_Daemon", user)
            if password:
                origen = "keyring"
        except Exception:
            password = None

    return user, password, origen


def resolver_puertos(config_data):
    op = str((config_data or {}).get("opcion_puerto", "3")).strip()
    return OPCIONES_PUERTOS.get(op, OPCIONES_PUERTOS["3"])


def resolver_intervalo_segundos(config_data):
    minutos_str = os.environ.get("MONITOR_MINUTOS") or os.environ.get("INTERVALO_MINUTOS")
    if not minutos_str and config_data:
        minutos_str = config_data.get("monitor_minutos")

    if minutos_str:
        try:
            minutos = float(minutos_str)
            if minutos > 0:
                return max(10, int(minutos * 60))
        except (ValueError, TypeError):
            pass

    return 300  # 5 minutos por defecto


def resolver_ruta_log(config_data):
    seccion = (config_data or {}).get("ruta_salida")
    carpeta = CARPETA_DATOS_DEFAULT

    if isinstance(seccion, dict):
        carpeta_cfg = str(seccion.get("carpeta", "")).strip()
        if carpeta_cfg:
            carpeta = carpeta_cfg

    carpeta_absoluta = os.path.join(_DIR_BASE, carpeta) if not os.path.isabs(carpeta) else carpeta
    try:
        os.makedirs(carpeta_absoluta, exist_ok=True)
    except Exception:
        carpeta_absoluta = os.path.join(_DIR_BASE, CARPETA_DATOS_DEFAULT)
        os.makedirs(carpeta_absoluta, exist_ok=True)

    return os.path.join(carpeta_absoluta, ARCHIVO_MONITOR_LOG_DEFAULT)


def advertir_permisos(rutas):
    """Avisa si archivos sensibles son legibles por otros usuarios (solo POSIX)."""
    avisos = []
    if os.name != "posix":
        return avisos
    for ruta in rutas:
        try:
            if os.path.isfile(ruta) and os.stat(ruta).st_mode & 0o077:
                avisos.append(f"{os.path.basename(ruta)} es accesible por otros usuarios (recomendado: chmod 600)")
        except OSError:
            pass
    return avisos


# ---------------------------------------------------------------------------
# LOG CON ROTACIÓN
# ---------------------------------------------------------------------------
_LOGGERS = {}


def _logger_para(ruta):
    lg = _LOGGERS.get(ruta)
    if lg is None:
        lg = logging.getLogger("cctv_monitor:" + ruta)
        lg.setLevel(logging.INFO)
        lg.propagate = False
        h = RotatingFileHandler(ruta, maxBytes=MAX_LOG_BYTES, backupCount=5, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(message)s"))
        lg.addHandler(h)
        if os.name == "posix":
            try:
                os.chmod(ruta, 0o640)
            except OSError:
                pass
        _LOGGERS[ruta] = lg
    return lg


def escribir_log(ruta_log, linea):
    try:
        prefijo = "\n" if linea.startswith("\n") else ""
        indent = "  " if linea.lstrip("\n").startswith("  ") else ""
        cuerpo = _RE_CONTROL.sub("", linea.strip("\n"))   # una sola línea por evento
        _logger_para(ruta_log).info(prefijo + indent + cuerpo.strip())
    except Exception as e:
        print(f"[WARN LOG] No se pudo escribir en '{ruta_log}': {e}")


# ---------------------------------------------------------------------------
# MAPEO DE NOMBRES E IPS DE CÁMARAS
# ---------------------------------------------------------------------------
def cargar_mapa_camaras():
    mapa = {}
    if os.path.isfile(ARCHIVO_ONLINE):
        try:
            with open(ARCHIVO_ONLINE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for cam in data.get("camaras", []):
                    nvr_ip = cam.get("nvr_ip")
                    ch_id = str(cam.get("channel_id"))
                    if nvr_ip and ch_id:
                        mapa[(nvr_ip, ch_id)] = {
                            "nombre": limpiar_texto(cam.get("camera_name", "N/A")),
                            "ip": limpiar_texto(cam.get("ip_address", "N/A"))
                        }
        except Exception as e:
            print(f"[WARN] No se pudo leer {ARCHIVO_ONLINE}: {e}")
    return mapa


def refrescar_mapa(ctx):
    """Recarga cctv_online.json solo si cambió en disco."""
    try:
        mtime = os.path.getmtime(ARCHIVO_ONLINE)
    except OSError:
        return
    if mtime != ctx.get("mapa_mtime"):
        ctx["mapa"] = cargar_mapa_camaras()
        if ctx.get("mapa_mtime") is not None:
            print(f"[INFO] cctv_online.json actualizado: {len(ctx['mapa'])} canales.")
        ctx["mapa_mtime"] = mtime


# ---------------------------------------------------------------------------
# POLÍTICA POR NVR
# ---------------------------------------------------------------------------
def construir_nvrs(config_data, pins_archivo, estricto):
    """Resuelve, para cada NVR, huella, protocolos permitidos y política de autenticación."""
    cadena_base = resolver_puertos(config_data)
    nvrs, vistos = [], set()

    for item in (config_data.get("nvrs") or []):
        if not isinstance(item, dict) or "ip" not in item:
            continue
        ip_raw = str(item["ip"]).strip()
        if ip_raw in vistos:
            continue
        vistos.add(ip_raw)

        nvr = {"idx": len(nvrs), "ip": ip_raw, "omitir": None, "pin": None,
               "puertos": [], "basic_https_ok": False, "basic_http_ok": False, "riesgos": []}
        nvrs.append(nvr)

        if not host_valido(ip_raw):
            nvr["ip"] = limpiar_texto(ip_raw, 60)
            nvr["omitir"] = "IP/host inválido en la configuración"
            continue

        pin_cfg = item.get("tls_sha256") or pins_archivo.get(ip_raw)
        if pin_cfg:
            try:
                nvr["pin"] = normalizar_huella(pin_cfg)
            except ValueError as e:
                nvr["omitir"] = f"huella TLS inválida ({e})"
                continue
        pin = nvr["pin"]

        exp_http = _tri_bool(item.get("permitir_http"))
        exp_basic = _tri_bool(item.get("permitir_basic"))

        if estricto:
            http_ok = exp_http is True
            basic_https_ok = exp_basic is True
            basic_http_ok = False
            legacy_ok = bool(pin)
        elif pin:
            http_ok = exp_http is True
            basic_https_ok = exp_basic is not False
            basic_http_ok = exp_basic is True and http_ok
            legacy_ok = True
        else:  # COMPATIBLE sin huella: igual que la versión anterior
            http_ok = exp_http is not False
            basic_https_ok = exp_basic is not False
            basic_http_ok = exp_basic is not False
            legacy_ok = True

        p_https = _puerto(item.get("puerto_https"), "443")
        p_http = _puerto(item.get("puerto_http"), "80")

        cadena = []
        for clave, _p in cadena_base:
            if clave == "http" and not http_ok:
                continue
            if clave == "https_legacy" and not legacy_ok:
                continue
            cadena.append((clave, p_https if clave.startswith("https") else p_http))

        nvr["puertos"] = cadena
        nvr["basic_https_ok"] = basic_https_ok
        nvr["basic_http_ok"] = basic_http_ok

        if estricto and not pin:
            nvr["omitir"] = "modo estricto: falta huella TLS (ejecutá --fijar-huellas)"
            continue
        if not cadena:
            nvr["omitir"] = "ningún protocolo permitido por la política (revisá permitir_http / opcion_puerto)"
            continue

        usa_https = any(k.startswith("https") for k, _ in cadena)
        usa_http = any(k == "http" for k, _ in cadena)
        if usa_https and not pin:
            nvr["riesgos"].append("sin_huella")
        if usa_http:
            nvr["riesgos"].append("http")
        if (usa_http and basic_http_ok) or (usa_https and not pin and basic_https_ok):
            nvr["riesgos"].append("basic")
        if any(k == "https_legacy" for k, _ in cadena) and not pin:
            nvr["riesgos"].append("tls_legacy")

    return nvrs


# ---------------------------------------------------------------------------
# CONSULTA DE ESTADO AL NVR VÍA ISAPI
# ---------------------------------------------------------------------------
def _trozos(resp):
    """Entrega los datos a medida que llegan (sin esperar a llenar un bloque), para poder
    evaluar el deadline aunque el servidor gotee 1 byte por vez."""
    raw = resp.raw
    leer = getattr(raw, "read1", None)              # urllib3 >= 2
    if leer is None:
        leer = getattr(getattr(raw, "_fp", None), "read1", None)   # urllib3 1.x -> http.client
    if leer is not None:
        while True:
            d = leer(8192)
            if not d:
                return
            yield d
    else:                                           # último recurso: 1 byte por vez
        while True:
            d = raw.read(1)
            if not d:
                return
            yield d


def leer_cuerpo_limitado(resp, deadline):
    """Lee la respuesta con tope de tamaño y de tiempo total (anti respuesta lenta/enorme)."""
    partes, total = [], 0
    for chunk in _trozos(resp):
        if time.monotonic() > deadline:
            raise TimeoutError("respuesta demasiado lenta (tiempo total agotado)")
        total += len(chunk)
        if total > MAX_BYTES_RESPUESTA:
            raise ValueError("respuesta demasiado grande")
        partes.append(chunk)
    return b"".join(partes)


def parsear_canales(cuerpo, nvr_ip, mapa_camaras):
    if b"\x00" in cuerpo:
        raise ValueError("codificación de respuesta no soportada")
    mayus = cuerpo.upper()
    if b"<!DOCTYPE" in mayus or b"<!ENTITY" in mayus:
        raise ValueError("XML con DTD/entidades rechazado")

    root = ET.fromstring(cuerpo)
    canales = []
    for elem in root.iter():
        if not elem.tag.endswith("InputProxyChannelStatus"):
            continue
        ch_id_el = None
        online_el = None
        for hijo in elem:
            if hijo.tag.endswith("id"):
                ch_id_el = hijo
            elif hijo.tag.endswith("online"):
                online_el = hijo

        if ch_id_el is not None and online_el is not None and ch_id_el.text and online_el.text:
            ch_id = ch_id_el.text.strip()
            if not _RE_CANAL.fullmatch(ch_id):
                continue   # id de canal inesperado: se descarta
            esta_online = (online_el.text.strip().lower() == "true")

            info_meta = mapa_camaras.get((nvr_ip, ch_id), {})
            canales.append({
                "nvr_ip": nvr_ip,
                "canal": ch_id,
                "online": esta_online,
                "nombre": info_meta.get("nombre", f"Canal {ch_id}"),
                "ip": info_meta.get("ip", "N/A"),
            })
    return canales


def consultar_status_nvr(args):
    nvr, user, password, mapa_camaras = args
    ip = nvr["ip"]
    host_url = f"[{ip}]" if ":" in ip else ip
    deadline = time.monotonic() + TIMEOUT_TOTAL_NVR
    errores = []

    for protocolo_key, puerto in nvr["puertos"]:
        if time.monotonic() > deadline:
            errores.append("tiempo total por NVR agotado")
            break

        proto_real = "https" if protocolo_key.startswith("https") else "http"
        etiqueta = f"{proto_real.upper()}:{puerto}"
        session = requests.Session()
        session.trust_env = False        # ignora proxies/.netrc/CA del entorno
        session.headers["Accept-Encoding"] = "identity"   # sin compresión: cuerpo acotado y predecible
        session.mount(f"{proto_real}://", crear_adapter(protocolo_key, nvr["pin"]))
        url = f"{proto_real}://{host_url}:{puerto}/ISAPI/ContentMgmt/InputProxy/channels/status"
        resp = None
        try:
            resp = session.get(url, auth=HTTPDigestAuth(user, password),
                               timeout=TIMEOUT_NVR, verify=False, stream=True)

            if resp.status_code == 401:
                desafio = resp.headers.get("WWW-Authenticate", "").lower()
                puede_basic = nvr["basic_https_ok"] if proto_real == "https" else nvr["basic_http_ok"]
                if puede_basic and (not desafio or "basic" in desafio):
                    # Fallback para grabadores o firmwares legacy que exigen Basic
                    resp.close()
                    resp = session.get(url, auth=HTTPBasicAuth(user, password),
                                       timeout=TIMEOUT_NVR, verify=False, stream=True)
                elif "basic" in desafio and "digest" not in desafio:
                    return ip, False, "POLITICA: el NVR exige Basic y está deshabilitado (permitir_basic)", []

            if resp.status_code == 401:
                # Credenciales rechazadas: no se prueban más protocolos (evita bloqueos y HTTP)
                return ip, False, MSG_AUTH, []

            if resp.status_code == 200:
                try:
                    cuerpo = leer_cuerpo_limitado(resp, deadline)
                    canales = parsear_canales(cuerpo, ip, mapa_camaras)
                except Exception as e:
                    # 200 con contenido inválido/hostil: se informa y NO se baja a otro protocolo
                    return ip, False, "respuesta inválida: " + limpiar_texto(e, 120), []
                return ip, True, "OK", canales

            errores.append(f"{etiqueta} HTTP {resp.status_code}")
        except requests.exceptions.SSLError as e:
            if nvr["pin"] and "ingerprint" in str(e):
                return ip, False, ("HUELLA: el certificado TLS no coincide con la huella fijada "
                                   "(posible MITM o certificado renovado)"), []
            errores.append(f"{etiqueta} {limpiar_texto(str(e), 100)}")
        except Exception as e:
            errores.append(f"{etiqueta} {limpiar_texto(str(e), 100)}")
        finally:
            try:
                if resp is not None:
                    resp.close()
            finally:
                session.close()

    return ip, False, (" | ".join(errores)[:300] or "sin respuesta"), []


_HILOS_PENDIENTES = {}


def consultar_todos(nvrs, user, password, mapa_camaras):
    """Consulta los NVR en paralelo con un tope global: un NVR lento no deja ciega al monitor."""
    resultados = {}
    estado = {"cerrado": False}
    sem = threading.Semaphore(MAX_HILOS)
    lock = threading.Lock()

    def trabajo(n):
        with sem:
            try:
                r = consultar_status_nvr((n, user, password, mapa_camaras))
            except Exception as e:
                r = (n["ip"], False, limpiar_texto(f"error interno: {e}", 160), [])
        with lock:
            if not estado["cerrado"]:
                resultados[n["idx"]] = r

    hilos = []
    for n in list(nvrs):
        previo = _HILOS_PENDIENTES.get(n["idx"])
        if previo is not None and previo.is_alive():
            # La consulta anterior sigue colgada (NVR que retiene la conexión): no se apilan hilos
            resultados[n["idx"]] = (n["ip"], False, "consulta anterior sin terminar (NVR muy lento o retiene la conexión)", [])
            continue
        h = threading.Thread(target=trabajo, args=(n,), daemon=True)
        _HILOS_PENDIENTES[n["idx"]] = h
        hilos.append(h)
    for h in hilos:
        h.start()

    olas = max(1, math.ceil(max(1, len(hilos)) / MAX_HILOS))
    limite = time.monotonic() + TIMEOUT_TOTAL_NVR * olas + 10
    for h in hilos:
        h.join(max(0.0, limite - time.monotonic()))

    with lock:
        estado["cerrado"] = True
        for n in nvrs:
            resultados.setdefault(n["idx"], (n["ip"], False, "sin respuesta (tiempo global agotado)", []))
        return dict(resultados)


# ---------------------------------------------------------------------------
# CICLO PRINCIPAL DE MONITOREO
# ---------------------------------------------------------------------------
def construir_ctx(estricto_cli=False):
    config_data = cargar_config()

    user, password, origen = resolver_credenciales(config_data)
    if not user or not password:
        raise ErrorFatal(f"No se encontraron credenciales en .env, JSON ni keyring.\n"
                         f" Archivo buscado: {ARCHIVO_ENV} / {ARCHIVO_CONFIG}")

    if not [i for i in (config_data.get("nvrs") or []) if isinstance(i, dict) and "ip" in i]:
        raise ErrorFatal("No hay NVRs configurados en cctv-scanner-config.json.")

    estricto = (estricto_cli
                or _tri_bool(os.environ.get("MONITOR_ESTRICTO")) is True
                or _tri_bool(config_data.get("modo_estricto")) is True)

    nvrs = construir_nvrs(config_data, cargar_pins(), estricto)
    intervalo = resolver_intervalo_segundos(config_data)

    ctx = {
        "user": user, "password": password, "origen_cred": origen,
        "estricto": estricto, "nvrs": nvrs, "config": config_data,
        "opcion_puerto": str(config_data.get("opcion_puerto", "3")),
        "intervalo": intervalo, "ruta_log": resolver_ruta_log(config_data),
        "mapa": {}, "mapa_mtime": None,
        "estado_previo": {}, "primera_pasada": True,
        "auth_hasta": {}, "ultimo_msg": {},
    }
    ctx["mapa"] = cargar_mapa_camaras()
    try:
        ctx["mapa_mtime"] = os.path.getmtime(ARCHIVO_ONLINE)
    except OSError:
        pass
    return ctx


def imprimir_banner(ctx):
    nvrs = ctx["nvrs"]
    activos = [n for n in nvrs if not n["omitir"]]
    omitidos = [n for n in nvrs if n["omitir"]]
    intervalo_minutos = ctx["intervalo"] / 60.0

    print("================================================================================")
    print(f" MONITOR DE CANALES CCTV ACTIVO ({len(activos)} de {len(nvrs)} NVRs)")
    print(f" Frecuencia   : Cada {intervalo_minutos:g} min ({ctx['intervalo']} s)")
    print(f" Modo         : {'ESTRICTO' if ctx['estricto'] else 'COMPATIBLE'}")
    print(f" Nivel TLS    : Opción {ctx['opcion_puerto']}")
    print(f" Credenciales : {ctx['origen_cred']}")
    print(f" Archivo Log  : {ctx['ruta_log']}")
    print(f" Mapeo Nombres: {len(ctx['mapa'])} canales cargados desde cctv_online.json")
    print(" Salir        : Presioná Ctrl + C")
    print("================================================================================")

    avisos = []
    con = lambda r: sum(1 for n in activos if r in n["riesgos"])
    if con("sin_huella"):
        avisos.append(f"{con('sin_huella')}/{len(activos)} NVRs SIN huella TLS fijada: no se verifica su identidad "
                      f"(riesgo de MITM). Ejecutá --fijar-huellas.")
    if con("basic"):
        avisos.append(f"{con('basic')}/{len(activos)} NVRs con Basic habilitado sobre un canal no verificado.")
    if con("http"):
        avisos.append(f"{con('http')}/{len(activos)} NVRs con fallback a HTTP habilitado.")
    if con("tls_legacy"):
        avisos.append(f"{con('tls_legacy')}/{len(activos)} NVRs con TLS legacy (1.0) sin huella fijada.")
    if ctx["origen_cred"] == "JSON (texto plano)":
        avisos.append("La contraseña está en texto plano en el JSON. Se recomienda keyring.")
    avisos += advertir_permisos([ARCHIVO_ENV, ARCHIVO_CONFIG, ARCHIVO_PINS])
    for n in omitidos:
        avisos.append(f"NVR {n['ip']} NO se monitorea: {n['omitir']}.")

    if avisos:
        print("[SEGURIDAD]")
        for a in avisos:
            print(f"  ! {a}")
        print()


def ciclo(ctx):
    ahora = datetime.datetime.now()
    timestamp_completo = ahora.strftime("%Y-%m-%d %H:%M:%S")
    hora_corta = ahora.strftime("%H:%M:%S")
    ruta_log = ctx["ruta_log"]
    primera_pasada = ctx["primera_pasada"]
    estado_previo = ctx["estado_previo"]

    refrescar_mapa(ctx)

    resultados, activos = {}, []
    ahora_m = time.monotonic()
    for n in ctx["nvrs"]:
        if n["omitir"]:
            resultados[n["idx"]] = (n["ip"], False, f"omitido: {n['omitir']}", [])
        elif ctx["auth_hasta"].get(n["idx"], 0) > ahora_m:
            resultados[n["idx"]] = (n["ip"], False, MSG_AUTH_PAUSA, [])
        else:
            activos.append(n)
    if activos:
        resultados.update(consultar_todos(activos, ctx["user"], ctx["password"], ctx["mapa"]))

    total_online = 0
    total_offline = 0
    caidas_actuales = []
    eventos_cambio = []

    for n in ctx["nvrs"]:
        nvr_ip, ok, msg, canales = resultados[n["idx"]]

        if not ok:
            if msg == MSG_AUTH:
                ctx["auth_hasta"][n["idx"]] = time.monotonic() + COOLDOWN_AUTH_S

            if msg.startswith("HUELLA"):
                alerta = f"[{hora_corta}] [ALERTA SEGURIDAD] {nvr_ip}: {msg}. No se enviaron credenciales."
                linea_log = f"[{timestamp_completo}] [ALERTA SEGURIDAD] {nvr_ip}: {msg}. No se enviaron credenciales."
            else:
                if msg.startswith("AUTH (pausa"):
                    estado_txt = "en pausa"
                elif msg.startswith("AUTH"):
                    estado_txt = "no autenticado"
                elif msg.startswith(("omitido", "POLITICA")):
                    estado_txt = "no consultado"
                else:
                    estado_txt = "inalcanzable"   # mismo texto que la versión anterior (compat. con búsquedas en logs)
                alerta = f"[{hora_corta}] [ALERTA NVR] {nvr_ip} {estado_txt} ({msg})"
                linea_log = f"[{timestamp_completo}] [ALERTA NVR] {nvr_ip} {estado_txt} ({msg})"
            print(alerta)

            persistente = msg.startswith(("omitido", "AUTH (pausa"))
            if not persistente or ctx["ultimo_msg"].get(n["idx"]) != msg:
                escribir_log(ruta_log, linea_log)
            ctx["ultimo_msg"][n["idx"]] = msg
            continue

        ctx["ultimo_msg"][n["idx"]] = "OK"
        for c in canales:
            clave = (c["nvr_ip"], c["canal"])
            estado_actual = c["online"]
            estado_anterior = estado_previo.get(clave)

            if not primera_pasada and estado_anterior is not None and estado_anterior != estado_actual:
                if not estado_actual:
                    txt_evento = f"[¡CAÍDA RECIENTE!] {c['nombre']} ({c['ip']}) - NVR {c['nvr_ip']} CH:{c['canal']}"
                    eventos_cambio.append(f"  {txt_evento}")
                    escribir_log(ruta_log, f"[{timestamp_completo}] {txt_evento}")
                else:
                    txt_evento = f"[RECUPERADA] {c['nombre']} ({c['ip']}) volvió a estar online."
                    eventos_cambio.append(f"  {txt_evento}")
                    escribir_log(ruta_log, f"[{timestamp_completo}] {txt_evento}")

            estado_previo[clave] = estado_actual

            if estado_actual:
                total_online += 1
            else:
                total_offline += 1
                caidas_actuales.append(c)

    if eventos_cambio:
        print(f"\n[{hora_corta}] --- ALERTAS DE CAMBIO DE ESTADO ---")
        for evento in eventos_cambio:
            print(evento)
        print("------------------------------------------")

    print(f"[{hora_corta}] Estado general: {total_online} Online | {total_offline} Offline")

    # Detalle con caja auto-ajustable
    if total_offline > 0:
        filas_cuerpo = []
        for c in caidas_actuales:
            ip_display = f"IP: {c['ip']:<15}" if c['ip'] != "N/A" else "IP: No asignada  "
            filas_cuerpo.append(f"[CAÍDA] {c['nombre'][:32]:<32} │ {ip_display} │ NVR: {c['nvr_ip']} (CH {c['canal']})")

        ancho = max([len(f) for f in filas_cuerpo] + [50])
        titulo_cabecera = "── Detalle de Cámaras Offline "
        print(f"  ┌{titulo_cabecera}{'─' * max(0, ancho + 2 - len(titulo_cabecera))}┐")
        for f in filas_cuerpo:
            print(f"  │ {f.ljust(ancho)} │")
        print(f"  └{'─' * (ancho + 2)}┘")

        if primera_pasada:
            escribir_log(ruta_log, f"[{timestamp_completo}] Resumen inicial: {total_online} Online | {total_offline} Offline")
            for c in caidas_actuales:
                escribir_log(ruta_log, f"  -> Inicialmente Offline: {c['nombre']} ({c['ip']}) [NVR {c['nvr_ip']} CH {c['canal']}]")
    else:
        if primera_pasada:
            escribir_log(ruta_log, f"[{timestamp_completo}] Resumen inicial: Todas las cámaras online ({total_online} canales).")

    ctx["primera_pasada"] = False


def ejecutar_monitor(estricto=False, una_vez=False):
    if sys.stdout.isatty():
        print(__doc__)

    try:
        ctx = construir_ctx(estricto)
    except ErrorFatal as e:
        print("\n" + "=" * 70)
        print(f" [ERROR FATAL] {e}")
        print("=" * 70)
        pausar()
        return 2

    imprimir_banner(ctx)
    escribir_log(ctx["ruta_log"], f"\n=== INICIO DE MONITOR CCTV ({datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) "
                                  f"[modo {'ESTRICTO' if ctx['estricto'] else 'COMPATIBLE'}] ===")

    errores = 0
    while True:
        try:
            ciclo(ctx)
            errores = 0
        except Exception as e:
            errores += 1
            aviso = f"[ERROR CICLO {errores}/{MAX_ERRORES_SEGUIDOS}] {limpiar_texto(e, 200)}"
            print(aviso)
            traceback.print_exc()
            escribir_log(ctx["ruta_log"], f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {aviso}")
            if errores >= MAX_ERRORES_SEGUIDOS:
                print("[ERROR FATAL] Demasiados errores seguidos; el monitor se detiene (un supervisor puede reiniciarlo).")
                return 1
        if una_vez:
            return 0 if errores == 0 else 1
        time.sleep(ctx["intervalo"])


# ---------------------------------------------------------------------------
# UTILIDAD: FIJAR HUELLAS TLS (confianza en el primer uso)
# ---------------------------------------------------------------------------
def cmd_fijar_huellas(forzar=False):
    config_data = cargar_config()
    items = [i for i in (config_data.get("nvrs") or []) if isinstance(i, dict) and "ip" in i]
    if not items:
        print("[ERROR] No hay NVRs configurados en cctv-scanner-config.json.")
        return 2

    print("Se leerá el certificado que presenta cada NVR y se guardará su huella SHA-256 en:")
    print(f"  {ARCHIVO_PINS}")
    print("IMPORTANTE: esto confía en lo que responda la red AHORA. Hacelo desde una red de confianza")
    print("y, si podés, comparalo con la huella que muestra la interfaz web del NVR.\n")
    if sys.stdin and sys.stdin.isatty():
        if input("¿Continuar? [s/N]: ").strip().lower() not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado.")
            return 1

    pins = cargar_pins()
    rc, cambios = 0, False
    for it in items:
        ip = str(it["ip"]).strip()
        if not host_valido(ip):
            print(f"  [SALTADO] '{limpiar_texto(ip, 60)}': IP/host inválido")
            rc = 1
            continue
        try:
            huella = obtener_huella_sha256(ip, _puerto(it.get("puerto_https"), "443"))
        except Exception as e:
            print(f"  [ERROR] {ip}: {limpiar_texto(e, 120)}")
            rc = 1
            continue

        en_json = it.get("tls_sha256")
        actual = en_json or pins.get(ip)
        try:
            actual_norm = normalizar_huella(actual) if actual else None
        except ValueError:
            actual_norm = None

        if actual_norm is None:
            pins[ip] = formatear_huella(huella)
            cambios = True
            print(f"  [FIJADA]   {ip}  {formatear_huella(huella)}")
        elif actual_norm == huella:
            print(f"  [SIN CAMBIOS] {ip}")
        elif forzar and not en_json:
            pins[ip] = formatear_huella(huella)
            cambios = True
            print(f"  [ACTUALIZADA] {ip}  {formatear_huella(huella)}")
        else:
            rc = 1
            donde = "en el JSON (tls_sha256)" if en_json else "en el archivo de huellas"
            print(f"  [DIFIERE]  {ip}: la huella guardada {donde} no coincide con la que presenta el NVR ahora.")
            print(f"             Ahora: {formatear_huella(huella)}")
            print("             Si renovaste el certificado a propósito, repetí con --forzar; si no, investigá (posible MITM).")

    if cambios:
        guardar_pins(pins)
        print(f"\nHuellas guardadas en {ARCHIVO_PINS}")
    return rc


def main(argv=None):
    ap = argparse.ArgumentParser(description="Monitor de disponibilidad CCTV (Hikvision ISAPI)")
    ap.add_argument("--fijar-huellas", action="store_true", help="lee y guarda la huella TLS de cada NVR")
    ap.add_argument("--forzar", action="store_true", help="con --fijar-huellas: reemplaza huellas distintas")
    ap.add_argument("--estricto", action="store_true", help="modo estricto (huella obligatoria, sin HTTP/Basic por defecto)")
    ap.add_argument("--una-vez", action="store_true", help="una sola pasada y salir")
    args = ap.parse_args(argv)

    if os.name == "posix":
        os.umask(0o027)   # archivos nuevos (log, huellas) sin acceso para "otros"
    cargar_env()

    if args.fijar_huellas:
        return cmd_fijar_huellas(args.forzar)
    return ejecutar_monitor(estricto=args.estricto, una_vez=args.una_vez)


if __name__ == "__main__":
    try:
        rc = main()
    except KeyboardInterrupt:
        print("\n[INFO] Monitor detenido por el usuario.")
        rc = 0
    except Exception as e:
        print(f"\n[ERROR GRAVE INESPERADO]: {e}")
        traceback.print_exc()
        pausar()
        rc = 1
    sys.exit(rc)
