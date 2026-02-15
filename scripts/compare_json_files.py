#!/usr/bin/env python3
"""
Script para comparar dos archivos JSON e identificar las diferencias.
"""

import json
import sys
from datetime import datetime

def load_json(filename):
    """Carga un archivo JSON"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error cargando {filename}: {e}")
        return None

def compare_json_files(file1, file2):
    """Compara dos archivos JSON y muestra las diferencias"""
    print(f"📊 Comparando archivos JSON...")
    print(f"  • Archivo 1: {file1}")
    print(f"  • Archivo 2: {file2}")
    print()
    
    # Cargar JSONs
    data1 = load_json(file1)
    data2 = load_json(file2)
    
    if data1 is None or data2 is None:
        return False
    
    # Comparar tamaños
    size1 = len(json.dumps(data1))
    size2 = len(json.dumps(data2))
    
    print(f"📏 Tamaños:")
    print(f"  • Archivo 1: {size1:,} bytes")
    print(f"  • Archivo 2: {size2:,} bytes")
    print(f"  • Diferencia: {abs(size2 - size1):,} bytes")
    print()
    
    # Comparación básica
    if data1 == data2:
        print("✅ Los archivos son idénticos")
        return True
    else:
        print("❌ Los archivos son diferentes")
        
        # Intentar comparación básica de claves principales
        keys1 = set(data1.keys()) if isinstance(data1, dict) else set()
        keys2 = set(data2.keys()) if isinstance(data2, dict) else set()
        
        if keys1 != keys2:
            print(f"\n🔑 Diferencias en claves principales:")
            added = keys2 - keys1
            removed = keys1 - keys2
            if added:
                print(f"  • Añadidas en archivo 2: {added}")
            if removed:
                print(f"  • Eliminadas en archivo 2: {removed}")
        
        # Comparar número de tarjetas si existe la sección cards
        if 'cards' in data1 and 'cards' in data2:
            cards1_count = sum(
                len(section_data) 
                for project in data1['cards'].values() 
                if isinstance(project, dict)
                for section_data in project.values()
                if isinstance(section_data, dict)
            )
            cards2_count = sum(
                len(section_data) 
                for project in data2['cards'].values() 
                if isinstance(project, dict)
                for section_data in project.values()
                if isinstance(section_data, dict)
            )
            
            print(f"\n📊 Conteo de tarjetas:")
            print(f"  • Archivo 1: {cards1_count} tarjetas")
            print(f"  • Archivo 2: {cards2_count} tarjetas")
            print(f"  • Diferencia: {cards2_count - cards1_count} tarjetas")
        
        return False

if __name__ == "__main__":
    file1 = sys.argv[1] if len(sys.argv) > 1 else "sample-default-rtdb.json"
    file2 = sys.argv[2] if len(sys.argv) > 2 else "sample-default-rtdb-2.json"
    
    result = compare_json_files(file1, file2)
    
    if not result:
        print("\n💡 Recomendación: Ejecutar el script de limpieza con el archivo más reciente")
        print(f"   python3 scripts/clean_and_migrate_firebase_json.py {file2}")