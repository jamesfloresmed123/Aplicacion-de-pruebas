# QACASES Web

Aplicación web para equipos QA/PO que permite:

- Cargar o pegar una historia de usuario o contrato API (al subir archivo se analiza automáticamente).
- Elegir modo de detección automática o tipo manual.
- Validar calidad con checklist y observaciones accionables.
- Generar casos de prueba en formato Gherkin en español, incluso cuando existan observaciones.
- Exportar casos generados a CSV (incluye el bloque Gherkin).

## Ejecutar localmente

```bash
python3 -m http.server 8080
```

Luego abrir: `http://localhost:8080`
