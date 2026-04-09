import csv
import json
import os
import re
from typing import List, Dict

INPUT_CSV = 'Docs/ExpedientesAbril.csv'
OUTPUT_DIR = 'Docs/rabbit_json/'
OUTPUT_SINGLE_FILE = 'Docs/rabbit_json/expedientes_filtrados.json'

# Lista de nombres de Rabbit a buscar
RABBIT_NAMES = [
    'MatriculaRealizada', 'MatriculaAnulada', 'MatriculaRecuperada', 'MatriculaDesestimada', 'MatriculaReiniciada',
    'MatriculaAmpliacionReiniciada', 'MatriculaAmpliacionAnulada', 'MatriculaAmpliacionDesestimada', 'MatriculaAmpliacionRecuperada',
    'MatriculaAmpliacionRealizada', 'MatriculaVariacionAnulada', 'MatriculaVariacionRealizada', 'MatriculaVariacionRecuperada',
    'ClienteModificado', 'DefensaModificada', 'ActaArchivada', 'CuentaBloqueada', 'CuentaDesbloqueada',
    'MatriculaPeriodoAcademicoCambiado', 'DocumentoFirmado', 'MatriculaVariacionReiniciada', 'MatriculaVariacionDesestimada',
    'NotaFinalGenerada', 'NotaDesglosadaModificada', 'ExpedientesMigrados', 'ProgresoEstudianteActualizado',
    'DiligenciaResuelta', 'ConvocatoriasTFECerradas', 'DiligenciaCerrada', 'ActaCancelada', 'FechaPagoTituloSolicitado'
]

# Compila un regex para buscar cualquiera de los nombres de Rabbit
RABBIT_REGEX = re.compile(r'(' + '|'.join(RABBIT_NAMES) + r')')

def ensure_output_dir(path: str):
    os.makedirs(path, exist_ok=True)

def extract_rabbit_name(message: str) -> str:
    match = RABBIT_REGEX.search(message)
    return match.group(1) if match else None

def csv_to_rabbit_json(input_csv: str, output_dir: str, output_single_file: str = None):
    ensure_output_dir(output_dir)
    mensajes: List[Dict] = []
    # Mensajes que deben extraer el JSON limpio del campo Request o similar
    LIMPIOS = {'NotaFinalGenerada', 'NotaDesglosadaModificada', 'ActaArchivada'}

    # Lista para mensajes que fallan al procesar
    mensajes_fallidos = []

    def extraer_json_limpio(texto: str) -> dict:
        # Busca el primer bloque JSON en el texto
        # Busca después de 'Request:' o después del primer '{'
        import json as _json
        import re as _re
        # Si es ActaArchivada, decodifica el campo Message con escapes tipo /u0022
        if 'ActaArchivada' in texto:
            # Busca el campo Message
            match = _re.search(r'"Message"\s*:\s*"([^"]+)"', texto)
            if match:
                raw = match.group(1)
                # Reemplaza /u0022 por ", /u002c por , y /u002f por /
                raw = raw.replace('/u0022', '"').replace('/u002c', ',').replace('/u002f', '/').replace('/u003a', ':')
                try:
                    return _json.loads(raw)
                except Exception:
                    return None
        # Busca Request: { ... }
        match = _re.search(r'Request:\s*(\{.*\})', texto, _re.DOTALL)
        if match:
            bloque = match.group(1)
        else:
            # Busca el primer JSON válido en el texto
            idx = texto.find('{')
            if idx == -1:
                return None
            bloque = texto[idx:]
        # Intenta decodificar el JSON
        try:
            # Busca el cierre correcto de llaves
            # Esto permite que si hay texto después del JSON, no falle
            stack = 0
            end = 0
            for i, c in enumerate(bloque):
                if c == '{':
                    stack += 1
                elif c == '}':
                    stack -= 1
                    if stack == 0:
                        end = i + 1
                        break
            if end == 0:
                return None
            bloque = bloque[:end]
            return _json.loads(bloque)
        except Exception:
            return None

    with open(input_csv, encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for idx, row in enumerate(reader):
            message = row.get('message', '')
            rabbit_name = extract_rabbit_name(message)
            if rabbit_name:
                # Si es uno de los mensajes que requieren JSON limpio
                if rabbit_name in LIMPIOS:
                    json_limpio = extraer_json_limpio(message)
                    if json_limpio:
                        mensaje = json_limpio
                    else:
                        mensajes_fallidos.append({
                            'rabbit_name': rabbit_name,
                            'timestamp': row.get('@timestamp'),
                            'message': message,
                            'error': 'No se pudo extraer JSON limpio'
                        })
                        continue
                else:
                    mensaje = {
                        'rabbit_name': rabbit_name,
                        'timestamp': row.get('@timestamp'),
                        'message': message
                    }
                mensajes.append(mensaje)
                # Crear subcarpeta por tipo de mensaje
                subdir = os.path.join(output_dir, rabbit_name)
                ensure_output_dir(subdir)
                # Nombre de archivo: <rabbit_name>_<fecha>.json
                fecha = row.get('@timestamp').replace(' ', '_').replace(':', '-') if row.get('@timestamp') else f'{idx+1}'
                filename = f'{rabbit_name}_{fecha}.json'
                with open(os.path.join(subdir, filename), 'w', encoding='utf-8') as f:
                    json.dump(mensaje, f, ensure_ascii=False, indent=2)
            else:
                mensajes_fallidos.append({
                    'row': idx+1,
                    'message': message,
                    'error': 'No se detectó tipo rabbit válido'
                })
    if output_single_file:
        with open(output_single_file, 'w', encoding='utf-8') as f:
            json.dump(mensajes, f, ensure_ascii=False, indent=2)
    # Guardar mensajes fallidos
    if mensajes_fallidos:
        with open(os.path.join(output_dir, 'mensajes_fallidos.json'), 'w', encoding='utf-8') as f:
            json.dump(mensajes_fallidos, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    csv_to_rabbit_json(INPUT_CSV, OUTPUT_DIR, OUTPUT_SINGLE_FILE)
