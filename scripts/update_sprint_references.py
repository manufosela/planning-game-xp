#!/usr/bin/env python3
import json

def get_project_ids(data):
    """
    Obtiene los IDs de los proyectos activos.
    """
    project_ids = set()
    
    # Buscar en la sección projects
    if "projects" in data:
        for project_id, project_data in data["projects"].items():
            if isinstance(project_data, dict):
                project_ids.add(project_id)
    
    # Buscar en la sección cards
    if "cards" in data:
        for project_id in data["cards"].keys():
            project_ids.add(project_id)
    
    return project_ids

def get_sprint_mappings(data):
    """
    Crea un diccionario de mapeos de títulos de sprint a cardIds.
    Retorna un diccionario con la estructura: {project_id: {sprint_title: sprint_cardId}}
    """
    sprint_mappings = {}
    project_ids = get_project_ids(data)
    
    print("\nBuscando sprints en los proyectos...")
    
    # Buscar sprints en la sección cards
    if "cards" in data:
        for project_id in project_ids:
            if project_id in data["cards"]:
                sprint_key = f"SPRINTS_{project_id}"
                if sprint_key in data["cards"][project_id]:
                    # Inicializar el mapeo para este proyecto
                    sprint_mappings[project_id] = {
                        "": "",  # Caso por defecto
                        "No Sprint selected": ""  # Caso por defecto
                    }
                    
                    # Obtener los sprints del proyecto
                    sprints = data["cards"][project_id][sprint_key]
                    if isinstance(sprints, dict):
                        print(f"\nSprints found in {project_id}:")
                        for sprint_id, sprint_data in sprints.items():
                            if isinstance(sprint_data, dict):
                                print(f"  Sprint ID: {sprint_id}")
                                print(f"    Title: {sprint_data.get('title', 'N/A')}")
                                print(f"    CardId: {sprint_data.get('cardId', 'N/A')}")
                                # Usar el cardId del sprint si existe
                                if "cardId" in sprint_data and "title" in sprint_data:
                                    sprint_mappings[project_id][sprint_data["title"]] = sprint_data["cardId"]
                                    print(f"    Mapping added: {sprint_data['title']} -> {sprint_data['cardId']}")
                                elif "title" in sprint_data:
                                    print(f"    Warning: Sprint sin cardId encontrado")
    
    return sprint_mappings

def clean_task(task, project_id, sprint_mappings):
    """
    Limpia y actualiza una tarea:
    1. Actualiza la referencia del sprint a cardId del sprint
    2. Elimina las listas redundantes y campos innecesarios
    """
    if not isinstance(task, dict):
        return task

    # Lista de campos a eliminar por ser redundantes o innecesarios
    fields_to_remove = {
        "sprintList",      # Ya está en SPRINTS_[projectId]
        "epicList",        # Ya está en EPICS_[projectId]
        "stakeholders",    # Ya está en la configuración del proyecto
        "developerList",   # Ya está en la configuración del proyecto
        "statusList",      # Ya está en la configuración del proyecto
        "priorityList",    # Ya está en la configuración del proyecto
        "statusTasksList", # Ya está en la configuración del proyecto
        "bugpriorityList", # Ya está en la configuración del proyecto
        "epicsList",       # Ya está en EPICS_[projectId] (variante del nombre)
        "expanded",        # Estado UI temporal
        "activeTab",       # Estado UI temporal
        "originalStatus",  # Campo temporal
        "group",          # Redundante con el tipo de documento
        "projectId",      # Redundante, ya está en la estructura
        "id"             # Redundante, es la clave del documento
    }
    
    # Crear una copia limpia de la tarea
    cleaned_task = {}
    task_id = task.get("cardId", "N/A")
    
    print(f"\nProcessing task {task_id}:")
    # Copiar solo los campos que queremos mantener
    for key, value in task.items():
        if key not in fields_to_remove:
            cleaned_task[key] = value
        else:
            print(f"  Removing field: {key}")
    
    # Actualizar el sprint si existe y hay un mapeo disponible
    if project_id in sprint_mappings and "sprint" in cleaned_task:
        sprint_title = cleaned_task["sprint"]
        print(f"  Current sprint: {sprint_title}")
        if sprint_title in sprint_mappings[project_id]:
            old_value = cleaned_task["sprint"]
            cleaned_task["sprint"] = sprint_mappings[project_id][sprint_title]
            print(f"  Updated sprint reference: {old_value} -> {cleaned_task['sprint']}")
        elif sprint_title:  # Si hay un sprint asignado pero no está en el mapeo
            print(f"  Warning: Sprint title not found in mappings: {sprint_title}")
    
    return cleaned_task

def process_project_data(project_data, project_id, sprint_mappings):
    """Procesa los datos de un proyecto específico."""
    if not isinstance(project_data, dict):
        return project_data
        
    updated_project = {}
    print(f"\nProcessing project: {project_id}")
    
    # Procesar cada sección del proyecto
    for key, value in project_data.items():
        if not (key.startswith("TASKS_") or key.startswith("BUGS_")):
            updated_project[key] = value
            continue
        
        print(f"\nProcessing section: {key}")
        # Procesar tareas o bugs
        if isinstance(value, dict):
            updated_project[key] = {}
            for item_id, item_data in value.items():
                if isinstance(item_data, dict):
                    cleaned_item = clean_task(item_data, project_id, sprint_mappings)
                    updated_project[key][item_id] = cleaned_item
                else:
                    updated_project[key][item_id] = item_data
    
    return updated_project

def update_data(data):
    """Actualiza y limpia el JSON completo."""
    # Obtener los mapeos de sprint por proyecto
    print("\nGenerando mapeos de sprints...")
    sprint_mappings = get_sprint_mappings(data)
    
    # Imprimir mapeos para debug
    for project_id, mappings in sprint_mappings.items():
        print(f"\nMappings for {project_id}:")
        for title, cardId in mappings.items():
            if title and cardId:  # Solo mostrar mapeos no vacíos
                print(f"  {title} -> {cardId}")
    
    print("\nProcesando proyectos...")
    updated_data = data.copy()  # Mantener la estructura original
    
    # Procesar cada proyecto en la sección cards
    if "cards" in updated_data:
        for project_id in sprint_mappings.keys():
            if project_id in updated_data["cards"]:
                updated_data["cards"][project_id] = process_project_data(
                    updated_data["cards"][project_id],
                    project_id,
                    sprint_mappings
                )
    
    return updated_data

def main():
    print("Leyendo archivo original...")
    with open("public/sample-default-rtdb-export.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print("\nActualizando y limpiando datos...")
    updated_data = update_data(data)
    
    print("\nGuardando archivo actualizado...")
    with open("public/sample-default-rtdb-export-modified.json", "w", encoding="utf-8") as f:
        json.dump(updated_data, f, indent=2, ensure_ascii=False)
    
    print("¡Proceso completado!")

if __name__ == "__main__":
    main() 