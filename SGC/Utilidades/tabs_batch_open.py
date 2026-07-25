import webbrowser
import os

def abrir_camaras():
    nombre_archivo = "ips.txt"
    
    # Verificar si el archivo existe
    if not os.path.exists(nombre_archivo):
        print(f"Error: No se encontró el archivo '{nombre_archivo}'.")
        print("Asegúrate de crearlo en la misma carpeta que este script y agregar las IPs.")
        return

    # Leer las IPs desde el archivo
    with open(nombre_archivo, "r") as archivo:
        # Extraer cada línea, limpiar espacios en blanco y saltos de línea
        ips = [linea.strip() for linea in archivo if linea.strip()]

    print("Iniciando el proceso de apertura de cámaras...")
    count = 0

    for ip in ips:
        url = f"http://{ip}"
        print(f"Abriendo interfaz de cámara en: {url}")
        
        # Abre la URL en el navegador predeterminado del sistema operativo
        webbrowser.open(url)
        
        count += 1

        # Pausar cada 10 IPs
        if count == 10:
            print("\n==========================================================")
            print("Se han abierto 10 cámaras en tu navegador.")
            input("Por favor presiona ENTER para abrir el siguiente grupo...")
            print("==========================================================\n")
            count = 0

    print("\n==========================================================")
    print("Proceso finalizado. Se han procesado todas las direcciones IP.")
    print("==========================================================")

if __name__ == "__main__":
    abrir_camaras()