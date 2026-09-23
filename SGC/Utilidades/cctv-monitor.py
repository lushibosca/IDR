"""
================================================================================
MONITOR DE DISPONIBILIDAD CCTV (Hikvision ISAPI Channel Status)
================================================================================
Consulta periódica y ultra liviana a los NVRs para conocer el estado online/offline
de los canales IP en tiempo real sin consultar individualmente a las cámaras.

Unificación total con cctv-scanner-config.json y .env:
  - Credenciales:   .env (NVR_USER/NVR_PASS) -> cctv-scanner-config.json -> Keyring
  - Seguridad/TLS:  "opcion_puerto" (mismas opciones 1 a 5 del scanner)
  - Frecuencia:     "monitor_minutos" (JSON o .env, default: 5 min)
  - Ruta de Log:    "ruta_salida" -> "carpeta" (default: "datos/cctv_monitor.log")
================================================================================
"""

import os
import sys
import ssl
import json
import time
import datetime
import warnings
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

# Silenciar advertencias de SSL/TLS (necesario para cámaras/NVRs legacy)
warnings.filterwarnings("ignore", category=DeprecationWarning, module="ssl")

try:
    import requests
    import urllib3
    from requests.adapters import HTTPAdapter
    from requests.auth import HTTPDigestAuth, HTTPBasicAuth
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    print("[ERROR] Se requiere la librería 'requests'. Ejecutá: pip install requests")
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

CARPETA_DATOS_DEFAULT = "datos"
ARCHIVO_MONITOR_LOG_DEFAULT = "cctv_monitor.log"

TIMEOUT_NVR = (3.0, 5.0)

# ---------------------------------------------------------------------------
# ADAPTADORES TLS Y CADENAS DE PROTOCOLOS (Idéntico a cctv-scanner.py)
# ---------------------------------------------------------------------------
class TLS13Adapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

class ModernTLSAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

class LegacyTLSAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            ctx.minimum_version = ssl.TLSVersion.TLSv1
        except AttributeError:
            pass
        try:
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')
        except ssl.SSLError:
            pass
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

_TLS13_SUPPORTED = hasattr(ssl, 'TLSVersion') and hasattr(ssl.TLSVersion, 'TLSv1_3')

ADAPTERS = {
    "https_modern": ModernTLSAdapter(),
    "https_legacy": LegacyTLSAdapter(),
    "http":         HTTPAdapter(),
}
if _TLS13_SUPPORTED:
    ADAPTERS["https_tls13"] = TLS13Adapter()

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

# ---------------------------------------------------------------------------
# CARGA DE .ENV Y CONFIGURACIÓN
# ---------------------------------------------------------------------------
def cargar_env():
    if not os.path.isfile(ARCHIVO_ENV):
        return

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
                    if clave:
                        os.environ[clave] = valor
                break
        except Exception:
            continue

cargar_env()

def resolver_credenciales(config_data):
    user = os.environ.get("NVR_USER") or os.environ.get("CCTV_USER")
    if not user and config_data:
        user = config_data.get("nvr_user")
    if user:
        user = str(user).strip()

    password = os.environ.get("NVR_PASS") or os.environ.get("CCTV_PASS")
    if password:
        password = str(password).strip()

    if not password and config_data:
        json_pass = config_data.get("nvr_pass")
        if json_pass:
            password = str(json_pass).strip()

    if not password and HAS_KEYRING and user:
        try:
            password = keyring.get_password("CCTV_Daemon", user)
        except Exception:
            password = None

    return user, password

def resolver_puertos(config_data):
    """Obtiene la configuración de puertos según 'opcion_puerto' del JSON."""
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

def escribir_log(ruta_log, linea):
    try:
        with open(ruta_log, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
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
                            "nombre": cam.get("camera_name", "N/A"),
                            "ip": cam.get("ip_address", "N/A")
                        }
        except Exception as e:
            print(f"[WARN] No se pudo leer {ARCHIVO_ONLINE}: {e}")
    return mapa

# ---------------------------------------------------------------------------
# CONSULTA DE ESTADO AL NVR VÍA ISAPI
# ---------------------------------------------------------------------------
def consultar_status_nvr(args):
    nvr_ip, puertos, user, password, mapa_camaras = args
    estado_canales = []
    exito = False
    error_msg = ""

    for protocolo_key, puerto in puertos:
        proto_real = "https" if protocolo_key.startswith("https") else "http"
        session = requests.Session()
        session.mount(f"{proto_real}://", ADAPTERS[protocolo_key])

        url = f"{proto_real}://{nvr_ip}:{puerto}/ISAPI/ContentMgmt/InputProxy/channels/status"
        try:
            resp = session.get(url, auth=HTTPDigestAuth(user, password), timeout=TIMEOUT_NVR, verify=False)
            if resp.status_code == 401:
                resp = session.get(url, auth=HTTPBasicAuth(user, password), timeout=TIMEOUT_NVR, verify=False)

            if resp.status_code == 200:
                xml_data = resp.text
                root = ET.fromstring(xml_data)

                for elem in root.iter():
                    if elem.tag.endswith("InputProxyChannelStatus"):
                        ch_id_el = None
                        online_el = None
                        for hijo in elem:
                            if hijo.tag.endswith("id"):
                                ch_id_el = hijo
                            elif hijo.tag.endswith("online"):
                                online_el = hijo

                        if ch_id_el is not None and online_el is not None:
                            ch_id = ch_id_el.text.strip()
                            esta_online = (online_el.text.strip().lower() == "true")
                            
                            info_meta = mapa_camaras.get((nvr_ip, ch_id), {})
                            nombre_cam = info_meta.get("nombre", f"Canal {ch_id}")
                            ip_cam = info_meta.get("ip", "N/A")

                            estado_canales.append({
                                "nvr_ip": nvr_ip,
                                "canal": ch_id,
                                "online": esta_online,
                                "nombre": nombre_cam,
                                "ip": ip_cam
                            })
                exito = True
                break
            else:
                error_msg = f"HTTP {resp.status_code}"
        except Exception as e:
            error_msg = str(e)

    if not exito:
        return nvr_ip, False, error_msg, []

    return nvr_ip, True, "OK", estado_canales

# ---------------------------------------------------------------------------
# CICLO PRINCIPAL DE MONITOREO
# ---------------------------------------------------------------------------
def ejecutar_monitor():
    config_data = {}
    if os.path.isfile(ARCHIVO_CONFIG):
        try:
            with open(ARCHIVO_CONFIG, "r", encoding="utf-8") as f:
                config_data = json.load(f)
        except Exception:
            pass

    user, password = resolver_credenciales(config_data)
    if not user or not password:
        print("[ERROR] No se encontraron credenciales en .env ni en cctv-scanner-config.json.")
        return

    nvr_list = [item["ip"] for item in config_data.get("nvrs", []) if "ip" in item]
    if not nvr_list:
        print("[ERROR] No hay lista de NVRs configurada en cctv-scanner-config.json.")
        return

    puertos = resolver_puertos(config_data)
    opcion_puerto_num = str(config_data.get("opcion_puerto", "3"))
    intervalo_segundos = resolver_intervalo_segundos(config_data)
    intervalo_minutos = intervalo_segundos / 60.0
    ruta_log = resolver_ruta_log(config_data)

    mapa_camaras = cargar_mapa_camaras()
    estado_previo = {}
    primera_pasada = True

    print(f"\n=======================================================")
    print(f"   MONITOR DE CANALES CCTV ACTIVO ({len(nvr_list)} NVRs)")
    print(f"   Frecuencia   : cada {intervalo_minutos:g} min ({intervalo_segundos} seg)")
    print(f"   Seguridad/TLS: Opción {opcion_puerto_num} (del JSON)")
    print(f"   Archivo Log  : '{ruta_log}'")
    print(f"   Mapeo Nombres: {len(mapa_camaras)} cargados desde cctv_online.json")
    print(f"   Salir        : Presioná Ctrl + C")
    print(f"=======================================================\n")

    escribir_log(ruta_log, f"\n=== INICIO DE MONITOR CCTV ({datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) ===")

    while True:
        timestamp_completo = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        hora_corta = datetime.datetime.now().strftime("%H:%M:%S")
        args_list = [(ip, puertos, user, password, mapa_camaras) for ip in nvr_list]

        total_online = 0
        total_offline = 0
        caidas_actuales = []
        eventos_cambio = []

        with ThreadPoolExecutor(max_workers=min(10, len(nvr_list))) as executor:
            resultados = executor.map(consultar_status_nvr, args_list)

        for nvr_ip, ok, msg, canales in resultados:
            if not ok:
                alerta_nvr = f"[{hora_corta}] [ALERTA NVR] {nvr_ip} inalcanzable ({msg})"
                print(alerta_nvr)
                escribir_log(ruta_log, f"[{timestamp_completo}] [ALERTA NVR] {nvr_ip} inalcanzable ({msg})")
                continue

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

        resumen_txt = f"[{hora_corta}] Estado general: {total_online} Online | {total_offline} Offline"
        print(resumen_txt)

        if total_offline > 0:
            lineas_imprimir = []
            for c in caidas_actuales:
                ip_display = f"IP: {c['ip']:<15}" if c['ip'] != "N/A" else "IP: No asignada  "
                lineas_imprimir.append(f"  │ [CAÍDA] {c['nombre'][:32]:<32} │ {ip_display} │ NVR: {c['nvr_ip']} (CH {c['canal']})")

            # Calcular el ancho exacto según la línea más ancha
            ancho_total = max([len(l) for l in lineas_imprimir] + [45])
            titulo_cabecera = "── Detalle de Cámaras Offline "
            relleno_superior = "─" * max(0, ancho_total - len(titulo_cabecera) - 3)
            borde_inferior = "─" * (ancho_total - 3)

            print(f"  ┌{titulo_cabecera}{relleno_superior}┐")
            for l in lineas_imprimir:
                print(f"{l.ljust(ancho_total)}│")
            print(f"  └{borde_inferior}┘")

            if primera_pasada:
                escribir_log(ruta_log, f"[{timestamp_completo}] Resumen inicial: {total_online} Online | {total_offline} Offline")
                for c in caidas_actuales:
                    escribir_log(ruta_log, f"  -> Inicialmente Offline: {c['nombre']} ({c['ip']}) [NVR {c['nvr_ip']} CH {c['canal']}]")
        else:
            if primera_pasada:
                escribir_log(ruta_log, f"[{timestamp_completo}] Resumen inicial: Todas las cámaras online ({total_online} canales).")

        primera_pasada = False
        time.sleep(intervalo_segundos)

if __name__ == "__main__":
    try:
        ejecutar_monitor()
    except KeyboardInterrupt:
        print("\n[INFO] Monitor detenido por el usuario.")