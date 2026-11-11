# Lee las IPs del archivo txt y genera la regla Regex para Bitwarden
with open('datos.txt', 'r') as file:
    # Limpia los espacios y escapa los puntos de las IPs
    ips = [line.strip().replace('.', r'\.') for line in file if line.strip()]

# Formatea la cadena final
regex_string = f"^https?://({'|'.join(ips)})"
print(regex_string)