#!/usr/bin/env python3
"""
Script para obtener el último ID de cada sección por proyecto.
"""

import json
import re
from collections import defaultdict

def get_last_ids(json_file):
    """Obtiene el último ID de cada tipo de card por proyecto"""
    
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    # Estructura: proyecto -> tipo -> último número
    last_ids = defaultdict(lambda: defaultdict(int))
    
    if 'cards' not in data:
        print("❌ No se encontró sección 'cards'")
        return
    
    for project_id, project_data in data['cards'].items():
        if not isinstance(project_data, dict):
            continue
        
        for section, section_data in project_data.items():
            if not isinstance(section_data, dict):
                continue
            
            for firebase_id, card_data in section_data.items():
                if not isinstance(card_data, dict):
                    continue
                
                card_id = card_data.get('cardId', '')
                
                # Extraer prefijo, tipo y número del cardId
                # Formato: PREFIX-TYPE-NUMBER (ej: C4D-TSK-0108)
                match = re.match(r'([A-Z0-9]+)-([A-Z]+)-(\d+)', card_id)
                if match:
                    prefix, card_type, number = match.groups()
                    number = int(number)
                    
                    # Actualizar el máximo para este proyecto y tipo
                    if number > last_ids[project_id][card_type]:
                        last_ids[project_id][card_type] = number
    
    return dict(last_ids)

def print_firestore_update_commands(last_ids):
    """Imprime los comandos para actualizar Firestore"""
    
    print("📊 ÚLTIMOS IDs POR PROYECTO Y TIPO:")
    print("=" * 60)
    
    firestore_updates = []
    
    for project_id in sorted(last_ids.keys()):
        print(f"\n🏷️  PROYECTO: {project_id}")
        print("-" * 40)
        
        for card_type in sorted(last_ids[project_id].keys()):
            last_number = last_ids[project_id][card_type]
            print(f"  • {card_type}: {last_number:04d}")
            
            # Generar comando de actualización para Firestore
            # Asumiendo que la estructura en Firestore es: /counters/{projectId}/{cardType}
            firestore_updates.append({
                'project': project_id,
                'type': card_type,
                'last_number': last_number,
                'next_number': last_number + 1
            })
    
    print("\n" + "=" * 60)
    print("🔥 COMANDOS PARA ACTUALIZAR FIRESTORE:")
    print("=" * 60)
    
    print("\n// Usando Firebase Admin SDK (Node.js/Python):")
    for update in firestore_updates:
        print(f"// {update['project']} - {update['type']}")
        print(f"await db.collection('counters').doc('{update['project']}').set({{")
        print(f"  '{update['type']}': {update['last_number']}")
        print(f"}}, {{ merge: true }});")
        print()
    
    print("\n// Usando Firebase CLI (si tienes estructura de documento único):")
    for update in firestore_updates:
        path = f"counters/{update['project']}"
        print(f"firebase firestore:set {path} '{{\"{update['type']}\":{update['last_number']}}}' --merge")
    
    print(f"\n📈 RESUMEN:")
    print(f"  • Total de proyectos: {len(last_ids)}")
    total_types = sum(len(types) for types in last_ids.values())
    print(f"  • Total de tipos de cards: {total_types}")
    
    print(f"\n💡 NOTA:")
    print(f"  • Estos son los ÚLTIMOS números utilizados")
    print(f"  • El PRÓXIMO ID a generar será último + 1")
    print(f"  • Ajusta los comandos según tu estructura de Firestore")

if __name__ == "__main__":
    import sys
    
    json_file = sys.argv[1] if len(sys.argv) > 1 else "sample-default-rtdb-2-cleaned-fixed-cardids-fixed-refs.json"
    
    print(f"📂 Analizando: {json_file}")
    
    last_ids = get_last_ids(json_file)
    
    if last_ids:
        print_firestore_update_commands(last_ids)
    else:
        print("❌ No se encontraron IDs válidos")