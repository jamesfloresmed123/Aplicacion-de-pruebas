const inputText = document.getElementById('inputText');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const exampleBtn = document.getElementById('exampleBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const modeButtons = document.querySelectorAll('.mode-btn');

const detectedTypeEl = document.getElementById('detectedType');
const scoreEl = document.getElementById('score');
const checksListEl = document.getElementById('checksList');
const observationsEl = document.getElementById('observations');
const testCasesEl = document.getElementById('testCases');

let selectedMode = 'auto';
let generatedCases = [];

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    selectedMode = btn.dataset.mode;
  });
});

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    inputText.value = text;
    analyzeContent();
  } catch (error) {
    alert('No se pudo leer el archivo. Verifica el formato e inténtalo nuevamente.');
  }
});

exampleBtn.addEventListener('click', () => {
  if (selectedMode === 'api') {
    inputText.value = `POST /orders\nRequest body: {"customerId":"123","items":[{"sku":"A1","qty":1}]}\nResponse 201: {"orderId":"ORD-1","status":"created"}\nErrores: 400, 401, 500\nAuth: Bearer token`;
  } else {
    inputText.value = `Como cliente de e-commerce quiero consultar el estado de mi pedido para conocer la fecha de entrega y planificar mi recepción.\n\nCriterios de aceptación:\nGiven que tengo un pedido activo, when ingreso al detalle del pedido, then visualizo el estado y la fecha estimada de entrega.\nGiven que el pedido está cancelado, when consulto el detalle, then visualizo estado cancelado y motivo.\nReglas: solo usuarios autenticados pueden ver su propio pedido.`;
  }
});

analyzeBtn.addEventListener('click', analyzeContent);

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  fileInput.value = '';
  generatedCases = [];
  exportBtn.disabled = true;
  detectedTypeEl.textContent = 'Tipo detectado: —';
  scoreEl.textContent = 'Puntaje: —';
  checksListEl.innerHTML = '';
  observationsEl.innerHTML = '<div class="placeholder">Aún no hay observaciones.</div>';
  testCasesEl.innerHTML = '<div class="placeholder">Analiza un contenido para generar casos.</div>';
});

exportBtn.addEventListener('click', () => {
  if (generatedCases.length === 0) return;

  const header = 'id,escenario,prioridad,tipo,gherkin';
  const rows = generatedCases.map((testCase, i) => {
    const gherkinLine = testCase.gherkin.replace(/\n/g, ' | ').replace(/"/g, '""');
    return `${i + 1},"${testCase.scenario}",${testCase.priority},${testCase.type},"${gherkinLine}"`;
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'casos-prueba-gherkin.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function analyzeContent() {
  const content = inputText.value.trim();
  if (!content) {
    alert('Ingresa o sube una historia de usuario o contrato API.');
    return;
  }

  const detectedType = getContentType(content);
  let result;
  try {
    result = detectedType === 'Historia de usuario' ? validateUserStory(content) : validateApiContract(content);
  } catch (error) {
    result = buildAnalysisFallback(error);
  }

  renderValidation(detectedType, result);
  try {
    generatedCases = generateTestCases(detectedType, content, result);
  } catch (error) {
    generatedCases = buildCaseGenerationFallback(detectedType, error);
  }
  renderTestCases(generatedCases);
  exportBtn.disabled = generatedCases.length === 0;
}

function buildAnalysisFallback(error) {
  return {
    checks: [{ label: 'Análisis automático ejecutado sin bloqueo', status: 'warn' }],
    observations: [
      'No se pudo completar el análisis detallado, pero puedes continuar generando casos de prueba.',
      `Detalle técnico: ${error?.message || 'Error no identificado'}`
    ],
    score: 0,
    isValid: false
  };
}

function buildCaseGenerationFallback(type, error) {
  return [
    createGherkinCase(
      `Generación de pruebas con análisis incompleto (${type})`,
      'Alta',
      'Contingencia',
      'Continuidad de diseño de pruebas',
      'el análisis automático presenta errores o incompletitud',
      'QA solicita generar casos base sin bloquear el proceso',
      `se obtiene al menos un caso utilizable y se registra: ${error?.message || 'Error no identificado'}`
    )
  ];
}

function getContentType(text) {
  if (selectedMode === 'story') return 'Historia de usuario';
  if (selectedMode === 'api') return 'Contrato API';
  const apiIndicators = /(openapi|swagger|paths:|\bGET\b|\bPOST\b|\bPUT\b|\bDELETE\b|\/\w+)/i;
  return apiIndicators.test(text) ? 'Contrato API' : 'Historia de usuario';
}

function validateUserStory(text) {
  const checks = [];
  const observations = [];
  let passed = 0;

  const normalized = text.replace(/\n/g, ' ');
  const template = /como\s+.+\s+quiero\s+.+\s+para\s+.+/i.test(normalized);
  addCheck(checks, template, 'Estructura estándar (Como/Quiero/Para)', 'err');
  if (!template) observations.push('Define rol, objetivo y beneficio en formato: Como... Quiero... Para...');
  passed += template ? 1 : 0;

  const acceptance = /(given|when|then|criterios? de aceptación|aceptaci[oó]n)/i.test(text);
  addCheck(checks, acceptance, 'Criterios de aceptación verificables', 'warn');
  if (!acceptance) observations.push('Agrega criterios de aceptación medibles (ideal: Given/When/Then).');
  passed += acceptance ? 1 : 0;

  const businessRules = /(regla|restricci[oó]n|no debe|debe|solo|únicamente)/i.test(text);
  addCheck(checks, businessRules, 'Reglas de negocio explícitas', 'warn');
  if (!businessRules) observations.push('Incluye reglas de negocio y restricciones funcionales.');
  passed += businessRules ? 1 : 0;

  const testable = text.split(/\s+/).length >= 35;
  addCheck(checks, testable, 'Nivel de detalle suficiente para pruebas', 'warn');
  if (!testable) observations.push('Amplía el detalle funcional y condiciones límite para mejores pruebas.');
  passed += testable ? 1 : 0;

  const score = Math.round((passed / checks.length) * 100);
  return { checks, observations, score, isValid: score >= 75 && template };
}

function validateApiContract(text) {
  const checks = [];
  const observations = [];
  let passed = 0;

  const endpoints = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w\-\/{}/]*/g) || [];
  const hasEndpoints = endpoints.length > 0;
  addCheck(checks, hasEndpoints, 'Endpoints con método y ruta', 'err');
  if (!hasEndpoints) observations.push('Incluye endpoints: GET /recurso, POST /recurso, etc.');
  passed += hasEndpoints ? 1 : 0;

  const hasRequest = /(request|body|payload|query|path|par[aá]metros)/i.test(text);
  addCheck(checks, hasRequest, 'Entrada definida (body/query/path)', 'warn');
  if (!hasRequest) observations.push('Define estructura de request y campos obligatorios.');
  passed += hasRequest ? 1 : 0;

  const hasResponses = /(response|respuesta|status|200|201|400|401|403|404|500)/i.test(text);
  addCheck(checks, hasResponses, 'Respuestas y códigos HTTP', 'warn');
  if (!hasResponses) observations.push('Documenta respuestas esperadas y códigos de error.');
  passed += hasResponses ? 1 : 0;

  const hasSchema = /(type:|schema|properties|required|json)/i.test(text);
  addCheck(checks, hasSchema, 'Esquema de datos identificado', 'warn');
  if (!hasSchema) observations.push('Agrega esquema o ejemplo JSON de request/response.');
  passed += hasSchema ? 1 : 0;

  const score = Math.round((passed / checks.length) * 100);
  return { checks, observations, score, isValid: score >= 75 && hasEndpoints };
}

function addCheck(list, condition, label, failLevel) {
  list.push({ label, status: condition ? 'ok' : failLevel });
}

function renderValidation(type, result) {
  detectedTypeEl.textContent = `Tipo detectado: ${type}`;
  scoreEl.textContent = `Puntaje: ${result.score}/100 ${result.isValid ? '✅ Aprobado' : '⚠️ Requiere ajustes'}`;

  checksListEl.innerHTML = '';
  result.checks.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = c.label;
    li.className = c.status === 'ok' ? 'check-ok' : c.status === 'warn' ? 'check-warn' : 'check-err';
    checksListEl.appendChild(li);
  });

  if (!result.observations.length) {
    observationsEl.innerHTML = '<p>Sin observaciones. Contenido apto para generar pruebas.</p>';
    return;
  }

  observationsEl.innerHTML = `<ul class="observations-list">${result.observations.map((o) => `<li>${o}</li>`).join('')}</ul>`;
}

function generateTestCases(type, content, validationResult) {
  if (type === 'Historia de usuario') {
    const tests = [
      createGherkinCase(
        'Validar flujo principal de la historia',
        'Alta',
        'Aceptación',
        'Flujo principal de historia de usuario',
        'el usuario cumple las precondiciones del negocio',
        'ejecuta el flujo principal definido en la historia',
        'el sistema muestra el resultado esperado y aporta el beneficio descrito'
      ),
      createGherkinCase(
        'Validar criterio de aceptación principal',
        'Alta',
        'Aceptación',
        'Cumplimiento de criterios Given/When/Then',
        'existe al menos un criterio de aceptación definido',
        'se ejecuta el escenario descrito por el criterio',
        'el resultado coincide exactamente con el criterio de aceptación'
      ),
      createGherkinCase(
        'Validar manejo de datos inválidos',
        'Media',
        'Negativo',
        'Manejo de errores funcionales',
        'el usuario ingresa datos inválidos o incompletos',
        'intenta completar la operación',
        'el sistema bloquea la acción y muestra un mensaje claro'
      ),
      createGherkinCase(
        'Validar control de autorización',
        'Media',
        'Seguridad',
        'Control de acceso por roles',
        'un usuario sin permisos intenta acceder al flujo',
        'solicita la funcionalidad restringida',
        'el sistema deniega el acceso y registra el intento'
      )
    ];

    if (!validationResult.isValid) {
      tests.unshift(
        createGherkinCase(
          'Refinar historia con observaciones detectadas',
          'Alta',
          'Mejora',
          'Mejora de calidad de historia de usuario',
          'la historia presenta observaciones de claridad o completitud',
          'el equipo revisa las observaciones y ejecuta un refinamiento funcional',
          'la historia queda clara, consistente y verificable para QA'
        )
      );
    }

    return tests;
  }

  const endpoints = [...content.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-\/{}/]*)/g)];
  const tests = [];
  endpoints.forEach((match) => {
    const method = match[1];
    const path = match[2];

    tests.push(
      createGherkinCase(
        `${method} ${path} responde exitosamente`,
        'Alta',
        'API',
        `${method} ${path} - Respuesta exitosa`,
        `el endpoint ${method} ${path} está disponible y autenticado`,
        `el cliente envía una solicitud válida a ${method} ${path}`,
        'el servicio responde con código 2xx y estructura esperada'
      )
    );

    tests.push(
      createGherkinCase(
        `${method} ${path} valida campos obligatorios`,
        'Alta',
        'API Negativo',
        `${method} ${path} - Validación de entrada`,
        `el endpoint ${method} ${path} define campos requeridos`,
        'el cliente omite un campo obligatorio en la solicitud',
        'el servicio responde con 4xx e informa el campo faltante'
      )
    );

    tests.push(
      createGherkinCase(
        `${method} ${path} rechaza credenciales inválidas`,
        'Media',
        'Seguridad API',
        `${method} ${path} - Seguridad de autenticación`,
        `el endpoint ${method} ${path} requiere autenticación`,
        'el cliente envía credenciales inválidas o expiradas',
        'el servicio responde con 401 o 403 sin exponer datos sensibles'
      )
    );
  });

  if (!tests.length) {
    tests.push(
      createGherkinCase(
        'Validar contrato API mínimo con entradas y salidas básicas',
        'Alta',
        'API Exploratorio',
        'Contrato API incompleto o no estructurado',
        'el contrato no define endpoints de forma explícita',
        'QA ejecuta validaciones exploratorias sobre request, response y errores',
        'se identifican brechas del contrato y se documentan hallazgos para ajuste'
      )
    );
  }

  if (!validationResult.isValid) {
    tests.unshift(
      createGherkinCase(
        'Revisar observaciones del contrato sin bloquear pruebas',
        'Media',
        'Mejora API',
        'Refinamiento de contrato API',
        'el análisis detecta observaciones en el contrato',
        'el equipo prioriza observaciones y ejecuta pruebas con el contrato actual',
        'se generan pruebas útiles mientras se planifica la mejora del contrato'
      )
    );
  }

  return tests;
}

function createGherkinCase(scenario, priority, type, feature, given, when, then) {
  const gherkin = `Característica: ${feature}\n  Escenario: ${scenario}\n    Dado ${given}\n    Cuando ${when}\n    Entonces ${then}`;
  return { scenario, priority, type, feature, given, when, then, gherkin };
}

function renderTestCases(cases) {
  if (!cases.length) {
    testCasesEl.textContent = 'No se detectaron casos automáticos.';
    return;
  }

  testCasesEl.innerHTML = `<ol class="test-list">${cases
    .map(
      (testCase) => `<li class="test-case"><strong>${testCase.scenario}</strong><br><small>Tipo: ${testCase.type} | Prioridad: ${testCase.priority}</small><pre>${testCase.gherkin}</pre></li>`
    )
    .join('')}</ol>`;
}
