#!/usr/bin/env python3
"""
Script para validar que el JSON limpio mantiene todos los datos importantes.
Compara el original con el limpio para asegurar que no se perdieron datos críticos.

Uso:
    python scripts/validate_cleaned_json.py
"""

import json
import sys
from collections import defaultdict

def load_json(filename):
    """Carga un archivo JSON"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error cargando {filename}: {e}")
        sys.exit(1)

def count_cards(data):
    """Cuenta el número total de tarjetas"""
    if not isinstance(data, dict) or 'cards' not in data:
        return 0
    
    count = 0
    cards_section = data.get('cards', {})
    
    for project_id, project_data in cards_section.items():
        if isinstance(project_data, dict):
            for section, section_data in project_data.items():
                if isinstance(section_data, dict):
                    count += len(section_data)
    
    return count

def validate_critical_fields(original, cleaned):
    """Valida que los campos críticos estén presentes"""
    critical_fields = ['cardId', 'title', 'status', 'projectId', 'createdBy', 'cardType']
    missing_fields = defaultdict(list)
    
    if 'cards' not in cleaned:
        return missing_fields
    
    for project_id, project_data in cleaned.get('cards', {}).items():
        if not isinstance(project_data, dict):
            continue
            
        for section, section_data in project_data.items():
            if not isinstance(section_data, dict):
                continue
                
            for card_id, card_data in section_data.items():
                if not isinstance(card_data, dict):
                    continue
                
                for field in critical_fields:
                    if field not in card_data and field != 'cardType':  # cardType puede ser inferido
                        missing_fields[f"{project_id}/{section}/{card_id}"].append(field)
    
    return missing_fields

def compare_structure(original, cleaned):
    """Compara la estructura básica de ambos JSONs"""
    results = {
        'original_keys': set(original.keys()),
        'cleaned_keys': set(cleaned.keys()),
        'removed_keys': set(original.keys()) - set(cleaned.keys()),
        'added_keys': set(cleaned.keys()) - set(original.keys())
    }
    
    return results

def analyze_removed_data(original, cleaned):
    """Analiza qué tipo de datos fueron removidos"""
    removed_fields = defaultdict(int)
    
    if 'cards' not in original or 'cards' not in cleaned:
        return removed_fields
    
    # Lista de campos que esperamos que sean removidos
    expected_removals = [
        'globalSprintList', 'statusList', 'projectsStakeHolders', 
        'stakeholders', 'developerList', 'bugTypeList', 'epicTypeList',
        'priorityList', 'bugpriorityList', 'history', 'developerHistory',
        'blockedHistory', 'cardHistory', 'projectStakeholders'
    ]
    
    for project_id in original.get('cards', {}):
        if project_id not in cleaned.get('cards', {}):
            continue
            
        for section in original['cards'][project_id]:
            if section not in cleaned['cards'].get(project_id, {}):
                continue
                
            for card_id in original['cards'][project_id][section]:
                orig_card = original['cards'][project_id][section][card_id]
                clean_card = cleaned['cards'][project_id][section].get(card_id, {})
                
                if isinstance(orig_card, dict) and isinstance(clean_card, dict):
                    for field in orig_card:
                        if field not in clean_card:
                            removed_fields[field] += 1
    
    return removed_fields, expected_removals

def main():
    print("🔍 Validando integridad de los datos limpios...\n")
    
    # Cargar JSONs
    original = load_json('sample-default-rtdb.json')
    cleaned = load_json('sample-default-rtdb-cleaned.json')
    history = load_json('sample-default-rtdb-history.json')
    
    # Contar tarjetas
    original_cards = count_cards(original)
    cleaned_cards = count_cards(cleaned)
    
    print(f"📊 Resumen de tarjetas:")
    print(f"  • Original: {original_cards} tarjetas")
    print(f"  • Limpio: {cleaned_cards} tarjetas")
    
    if original_cards != cleaned_cards:
        print(f"  ⚠️  ADVERTENCIA: Diferencia de {original_cards - cleaned_cards} tarjetas")
    else:
        print(f"  ✅ Todas las tarjetas preservadas")
    
    # Comparar estructura principal
    structure = compare_structure(original, cleaned)
    print(f"\n🏗️  Estructura principal:")
    print(f"  • Claves originales: {', '.join(structure['original_keys'])}")
    print(f"  • Claves en limpio: {', '.join(structure['cleaned_keys'])}")
    if structure['removed_keys']:
        print(f"  • Claves eliminadas: {', '.join(structure['removed_keys'])}")
    if structure['added_keys']:
        print(f"  • Claves añadidas: {', '.join(structure['added_keys'])}")
    
    # Validar campos críticos
    missing = validate_critical_fields(original, cleaned)
    if missing:
        print(f"\n⚠️  Campos críticos faltantes:")
        for card, fields in list(missing.items())[:5]:  # Mostrar solo las primeras 5
            print(f"  • {card}: {', '.join(fields)}")
        if len(missing) > 5:
            print(f"  • ... y {len(missing) - 5} tarjetas más")
    else:
        print(f"\n✅ Todos los campos críticos preservados")
    
    # Analizar datos removidos
    removed, expected = analyze_removed_data(original, cleaned)
    print(f"\n🗑️  Campos removidos (top 10):")
    
    # Separar en esperados e inesperados
    expected_removed = {}
    unexpected_removed = {}
    
    for field, count in removed.items():
        if field in expected or field.endswith('List'):
            expected_removed[field] = count
        else:
            unexpected_removed[field] = count
    
    # Mostrar esperados
    if expected_removed:
        print("  ✅ Removidos esperados:")
        for field, count in sorted(expected_removed.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"     • {field}: {count} ocurrencias")
    
    # Mostrar inesperados (si los hay)
    if unexpected_removed:
        print("  ⚠️  Removidos inesperados:")
        for field, count in sorted(unexpected_removed.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"     • {field}: {count} ocurrencias")
    
    # Validar histórico
    if 'history' in history:
        history_entries = 0
        history_cards = set()
        
        for project_id in history['history']:
            for card_type in history['history'][project_id]:
                for card_id in history['history'][project_id][card_type]:
                    history_cards.add(card_id)
                    history_entries += len(history['history'][project_id][card_type][card_id])
        
        print(f"\n📜 Histórico migrado:")
        print(f"  • Tarjetas con histórico: {len(history_cards)}")
        print(f"  • Total de entradas: {history_entries}")
    
    # Resumen final
    print(f"\n{'='*50}")
    print(f"📋 RESUMEN FINAL:")
    
    original_size = len(json.dumps(original))
    cleaned_size = len(json.dumps(cleaned))
    history_size = len(json.dumps(history))
    reduction = ((original_size - cleaned_size) / original_size) * 100
    
    print(f"  • Reducción de tamaño: {reduction:.1f}%")
    print(f"  • Tamaño total después (limpio + histórico): {(cleaned_size + history_size)/1024/1024:.2f} MB")
    print(f"  • Ahorro neto: {(original_size - (cleaned_size + history_size))/1024/1024:.2f} MB")
    
    if original_cards == cleaned_cards and not unexpected_removed:
        print(f"\n✅ VALIDACIÓN EXITOSA: Los datos críticos se preservaron correctamente")
    else:
        print(f"\n⚠️  VALIDACIÓN CON ADVERTENCIAS: Revisar los puntos marcados arriba")

if __name__ == "__main__":
    main()