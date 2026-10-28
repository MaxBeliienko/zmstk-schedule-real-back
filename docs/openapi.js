// Опис API у форматі OpenAPI 3 для Swagger UI (сторінка /api/docs, див. app.js).
// Коли додаєте або змінюєте маршрут у routes/, оновіть і цей файл.

// ---------- Короткі помічники, щоб не повторювати однакові фрагменти ----------

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ "application/json": { schema } });
const ok = (description, schema) => ({ description, content: json(schema) });
const body = (schema, required = true) => ({ required, content: json(schema) });
const errors = (...codes) =>
  Object.fromEntries(codes.map((code) => [code, { $ref: `#/components/responses/E${code}` }]));

const q = (name, description, { required = false, schema = { type: "string" } } = {}) => ({
  in: "query",
  name,
  required,
  description,
  schema,
});
const date = (name, description, required = true) =>
  q(name, description, { required, schema: { type: "string", format: "date" } });
const idParam = (name = "id", description = "ID запису") => ({
  in: "path",
  name,
  required: true,
  description,
  schema: { type: "string" },
});

const success = (props = {}) => ({
  type: "object",
  properties: { success: { type: "boolean", example: true }, ...props },
});
const list = (key, item) => success({ [key]: { type: "array", items: item } });

const ROLES = ["admin", "accountant", "instructor"];

// ---------- Специфікація ----------

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "ZMSTK Schedule API",
    version: "2.2.0",
    description:
      "REST API системи розкладу автошколи ЗМСТК.\n\n" +
      "**Авторизація:** `POST /api/auth/login` з паролем повертає токен. Натисніть **Authorize** " +
      "і вставте токен — далі всі запити на цій сторінці підуть від імені цього користувача.\n\n" +
      "Формат помилок однаковий для всього API: `{ success: false, message }`.",
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Налаштування", description: "Спільні константи для фронтенду" },
    { name: "Авторизація" },
    { name: "Користувачі", description: "Облікові записи адміністраторів і бухгалтерів (лише адмін)" },
    { name: "Інструктори" },
    { name: "Транспорт (МТБ)" },
    { name: "Реальний графік", description: "Графік, який інструктори заповнюють самі" },
    { name: "Плановий графік", description: "Заняття, які планує адмін (лише адмін)" },
    { name: "Курсанти" },
    { name: "Календар", description: "Нагадування та сповіщення" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    responses: {
      E400: { description: "Некоректні дані запиту", content: json(ref("Error")) },
      E401: { description: "Немає токена, токен недійсний або сесія завершилась", content: json(ref("Error")) },
      E403: { description: "Недостатньо прав або обліковий запис заблоковано", content: json(ref("Error")) },
      E404: { description: "Запис не знайдено", content: json(ref("Error")) },
      E409: { description: "Конфлікт (зайнятий час / ТЗ, пароль уже використовується тощо)", content: json(ref("Error")) },
      E429: { description: "Забагато невдалих спроб входу", content: json(ref("Error")) },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Невірний пароль" },
        },
      },
      User: {
        type: "object",
        description: "Поточний користувач. Для інструктора id — це id інструктора.",
        properties: {
          id: { type: "string" },
          accountId: { type: "string" },
          role: { type: "string", enum: ROLES },
          fullName: { type: "string" },
        },
      },
      Account: {
        type: "object",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string" },
          role: { type: "string", enum: ["admin", "accountant"] },
          isActive: { type: "boolean" },
          isSelf: { type: "boolean", description: "Це обліковий запис поточного користувача" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Instructor: {
        type: "object",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string", example: "Яценко Т.О." },
          certificate: { type: "array", items: { type: "string" }, example: ["B", "C"] },
          medicalExamUntil: { type: "string", example: "2027-01-31" },
          sanitaryBookUntil: { type: "string", example: "" },
        },
      },
      InstructorInput: {
        type: "object",
        properties: {
          fullName: { type: "string" },
          password: { type: "string", description: "Обов'язковий при створенні; при редагуванні — лише якщо змінюється" },
          certificate: { type: "array", items: { type: "string" } },
          medicalExamUntil: { type: "string", format: "date" },
          sanitaryBookUntil: { type: "string", format: "date" },
        },
      },
      Vehicle: {
        type: "object",
        properties: {
          _id: { type: "string" },
          brand: { type: "string", example: "Renault Logan" },
          plateNumber: { type: "string", example: "ВА1234АА" },
          category: { type: "array", items: { type: "string" } },
          isTowbar: { type: "boolean" },
          isTrailer: { type: "boolean" },
          responsibleInstructorId: { type: "string", nullable: true },
          insuranceUntil: { type: "string" },
          inspectionUntil: { type: "string" },
        },
      },
      RealSlot: {
        type: "object",
        properties: {
          timeSlot: { type: "string", example: "08:00-09:00" },
          vehicleId: { type: "string", nullable: true },
          location: { type: "string" },
          studentName: { type: "string" },
          isGarage: { type: "boolean" },
        },
      },
      PlannedLessonInput: {
        type: "object",
        required: ["instructorId", "studentId", "vehicleId", "exerciseCode", "category", "date", "startTime"],
        properties: {
          instructorId: { type: "string" },
          studentId: { type: "string" },
          vehicleId: { type: "string" },
          trailerId: { type: "string", nullable: true },
          exerciseCode: { type: "string", example: "1.1" },
          category: { type: "string", example: "B" },
          date: { type: "string", format: "date" },
          startTime: { type: "string", example: "08:00" },
          isExam: { type: "boolean" },
        },
      },
      Student: {
        type: "object",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string" },
          phone: { type: "string" },
          group: { type: "string" },
          category: { type: "string" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          studyType: { type: "string", enum: ["Теорія", "Практика"] },
          isPreparation: { type: "boolean" },
          cost: { type: "number" },
          prepayment: { type: "number" },
          instructorIds: { type: "array", items: { type: "string" } },
          status: { type: "string", description: "Активний / Очікує / Неактивний / Архів" },
          prepaymentHistory: {
            type: "array",
            items: {
              type: "object",
              properties: {
                amount: { type: "number" },
                delta: { type: "number" },
                role: { type: "string" },
                byName: { type: "string", description: "Хто вніс зміну" },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      ReminderInput: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", format: "date" },
          remindBefore: { type: "array", items: { type: "string", enum: ["1_day", "1_week", "2_weeks", "1_month"] } },
          repeat: { type: "string", enum: ["none", "daily", "weekly", "monthly", "yearly"] },
          assigneeRoles: { type: "array", items: { type: "string", enum: ["admin", "accountant"] } },
          assigneeInstructorIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ---------------- Налаштування ----------------
    "/config": {
      get: {
        tags: ["Налаштування"],
        summary: "Спільні налаштування для фронтенду",
        description:
          "Категорії, години графіків, ліміти, мінімальна довжина пароля, варіанти нагадувань. " +
          "Фронтенд завантажує їх під час старту — значення змінюються лише на бекенді.",
        security: [],
        responses: { 200: ok("Налаштування", success({ config: { type: "object" } })) },
      },
    },

    // ---------------- Авторизація ----------------
    "/auth/login": {
      post: {
        tags: ["Авторизація"],
        summary: "Вхід за паролем",
        description:
          "Роль визначається за паролем. Після 10 невдалих спроб з однієї IP вхід з неї блокується на 15 хв.",
        security: [],
        requestBody: body({
          type: "object",
          required: ["password"],
          properties: { password: { type: "string" } },
        }),
        responses: {
          200: ok("Успішний вхід", success({ token: { type: "string" }, user: ref("User") })),
          ...errors(400, 401, 403, 429),
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Авторизація"],
        summary: "Поточний користувач (перевірка сесії)",
        responses: { 200: ok("Дані користувача", success({ user: ref("User") })), ...errors(401) },
      },
    },

    // ---------------- Користувачі ----------------
    "/accounts": {
      get: {
        tags: ["Користувачі"],
        summary: "Список адміністраторів і бухгалтерів",
        responses: { 200: ok("Список", list("accounts", ref("Account"))), ...errors(401, 403) },
      },
      post: {
        tags: ["Користувачі"],
        summary: "Додати адміністратора або бухгалтера",
        requestBody: body({
          type: "object",
          required: ["fullName", "role", "password"],
          properties: {
            fullName: { type: "string" },
            role: { type: "string", enum: ["admin", "accountant"] },
            password: { type: "string", minLength: 8 },
          },
        }),
        responses: { 201: ok("Створено", success({ account: ref("Account") })), ...errors(400, 401, 403, 409) },
      },
    },
    "/accounts/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Користувачі"],
        summary: "Змінити ім'я, роль, пароль або заблокувати",
        description: "Зміна пароля, ролі чи блокування завершує всі сесії користувача.",
        requestBody: body({
          type: "object",
          properties: {
            fullName: { type: "string" },
            role: { type: "string", enum: ["admin", "accountant"] },
            password: { type: "string" },
            isActive: { type: "boolean" },
          },
        }),
        responses: { 200: ok("Збережено", success({ account: ref("Account") })), ...errors(400, 401, 403, 404, 409) },
      },
      delete: {
        tags: ["Користувачі"],
        summary: "Видалити обліковий запис",
        responses: { 200: ok("Видалено", success()), ...errors(400, 401, 403, 404) },
      },
    },

    // ---------------- Інструктори ----------------
    "/instructors": {
      get: {
        tags: ["Інструктори"],
        summary: "Список інструкторів (ПІБ і категорії)",
        responses: { 200: ok("Список", list("instructors", ref("Instructor"))), ...errors(401) },
      },
      post: {
        tags: ["Інструктори"],
        summary: "Додати інструктора (адмін, бухгалтер)",
        requestBody: body(ref("InstructorInput")),
        responses: { 201: ok("Створено", success({ instructor: ref("Instructor") })), ...errors(400, 401, 403, 409) },
      },
    },
    "/instructors/staff": {
      get: {
        tags: ["Інструктори"],
        summary: "Список зі строками документів (адмін, бухгалтер)",
        responses: { 200: ok("Список", list("instructors", ref("Instructor"))), ...errors(401, 403) },
      },
    },
    "/instructors/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Інструктори"],
        summary: "Редагувати інструктора (адмін, бухгалтер)",
        requestBody: body(ref("InstructorInput")),
        responses: {
          200: ok("Збережено", success({ instructor: ref("Instructor"), passwordChanged: { type: "boolean" } })),
          ...errors(400, 401, 403, 404, 409),
        },
      },
      delete: {
        tags: ["Інструктори"],
        summary: "Видалити інструктора (адмін)",
        description: "Не можна, поки в інструктора є майбутні заняття.",
        responses: { 200: ok("Видалено", success()), ...errors(400, 401, 403, 404, 409) },
      },
    },
    "/instructors/me/autodrome": {
      get: {
        tags: ["Інструктори"],
        summary: "Заняття на автодромі поточного інструктора на дату",
        parameters: [date("date", "Дата")],
        responses: {
          200: ok("Час занять", list("slots", { type: "object", properties: { startTime: { type: "string" }, endTime: { type: "string" } } })),
          ...errors(400, 401, 403),
        },
      },
    },
    "/instructors/{id}/students": {
      parameters: [idParam("id", "ID інструктора")],
      get: {
        tags: ["Інструктори"],
        summary: "Журнал курсантів інструктора (інструктор — лише свій, адмін — будь-який)",
        parameters: [q("search", "Пошук за ПІБ, телефоном або групою")],
        responses: { 200: ok("Курсанти", list("students", ref("Student"))), ...errors(400, 401, 403) },
      },
    },

    // ---------------- Транспорт ----------------
    "/vehicles": {
      get: {
        tags: ["Транспорт (МТБ)"],
        summary: "Список транспортних засобів",
        responses: { 200: ok("Список", list("vehicles", ref("Vehicle"))), ...errors(401) },
      },
      post: {
        tags: ["Транспорт (МТБ)"],
        summary: "Додати ТЗ (адмін, бухгалтер)",
        requestBody: body(ref("Vehicle")),
        responses: { 201: ok("Створено", success({ vehicle: ref("Vehicle") })), ...errors(400, 401, 403) },
      },
    },
    "/vehicles/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Транспорт (МТБ)"],
        summary: "Редагувати ТЗ (адмін, бухгалтер)",
        requestBody: body(ref("Vehicle")),
        responses: { 200: ok("Збережено", success({ vehicle: ref("Vehicle") })), ...errors(400, 401, 403, 404) },
      },
    },

    // ---------------- Реальний графік ----------------
    "/schedule/instructor-day": {
      get: {
        tags: ["Реальний графік"],
        summary: "День інструктора (усі слоти)",
        parameters: [date("date", "Дата"), q("instructorId", "ID інструктора", { required: true })],
        responses: {
          200: ok("Слоти дня", success({ slots: { type: "array", items: ref("RealSlot") }, instructor: ref("Instructor") })),
          ...errors(400, 401, 403, 404),
        },
      },
    },
    "/schedule/admin-day": {
      get: {
        tags: ["Реальний графік"],
        summary: "Зведений день по всіх інструкторах (адмін, бухгалтер)",
        parameters: [date("date", "Дата")],
        responses: { 200: ok("Записи дня", list("schedules", { type: "object" })), ...errors(400, 401, 403) },
      },
    },
    "/schedule/admin-instructor-period": {
      get: {
        tags: ["Реальний графік"],
        summary: "Графік інструктора за період, до 62 днів (адмін, бухгалтер)",
        parameters: [q("instructorId", "ID інструктора", { required: true }), date("startDate", "Початок"), date("endDate", "Кінець")],
        responses: { 200: ok("Записи", list("schedules", { type: "object" })), ...errors(400, 401, 403) },
      },
    },
    "/schedule/save": {
      post: {
        tags: ["Реальний графік"],
        summary: "Зберегти день інструктора (інструктор — свій, від позавчора; адмін — будь-який)",
        requestBody: body({
          type: "object",
          required: ["date", "instructorId", "slots"],
          properties: {
            date: { type: "string", format: "date" },
            instructorId: { type: "string" },
            slots: { type: "array", items: ref("RealSlot") },
          },
        }),
        responses: { 200: ok("Збережено", success()), ...errors(400, 401, 403, 409) },
      },
    },

    // ---------------- Плановий графік ----------------
    "/admin/exercises": {
      get: {
        tags: ["Плановий графік"],
        summary: "Довідник вправ за категоріями",
        responses: { 200: ok("Вправи", list("exercises", { type: "object" })), ...errors(401, 403) },
      },
    },
    "/admin/planned-schedule": {
      get: {
        tags: ["Плановий графік"],
        summary: "Заняття за період (до 62 днів), за інструктором або ТЗ",
        parameters: [
          date("startDate", "Початок"),
          date("endDate", "Кінець"),
          q("instructorId", "Фільтр за інструктором"),
          q("vehicleId", "Фільтр за ТЗ (основне авто або причіп)"),
        ],
        responses: { 200: ok("Заняття", list("schedules", { type: "object" })), ...errors(400, 401, 403) },
      },
      post: {
        tags: ["Плановий графік"],
        summary: "Додати заняття",
        description: "Тривалість і автодром беруться з довідника вправ. Перевіряються конфлікти ТЗ, курсанта й інструктора.",
        requestBody: body(ref("PlannedLessonInput")),
        responses: { 201: ok("Створено", success({ slot: { type: "object" } })), ...errors(400, 401, 403, 409) },
      },
    },
    "/admin/planned-schedule/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Плановий графік"],
        summary: "Редагувати заняття (непередані поля лишаються)",
        requestBody: body(ref("PlannedLessonInput")),
        responses: { 200: ok("Збережено", success({ slot: { type: "object" } })), ...errors(400, 401, 403, 404, 409) },
      },
      delete: {
        tags: ["Плановий графік"],
        summary: "Видалити заняття",
        responses: { 200: ok("Видалено", success()), ...errors(400, 401, 403, 404) },
      },
    },
    "/admin/planned-schedule/available-resources": {
      get: {
        tags: ["Плановий графік"],
        summary: "Вільні курсанти й ТЗ на інтервал часу",
        parameters: [
          date("date", "Дата"),
          q("startTime", "Початок, ГГ:ХХ", { required: true }),
          q("endTime", "Кінець, ГГ:ХХ", { required: true }),
          q("category", "Категорія"),
          q("currentScheduleId", "Заняття, яке редагується (не вважається зайнятим)"),
          q("includeArchive", "true — разом з архівними курсантами"),
        ],
        responses: {
          200: ok("Вільні ресурси", success({ students: { type: "array", items: ref("Student") }, vehicles: { type: "array", items: ref("Vehicle") } })),
          ...errors(400, 401, 403),
        },
      },
    },
    "/admin/student-schedules/{studentId}": {
      parameters: [idParam("studentId", "ID курсанта")],
      get: {
        tags: ["Плановий графік"],
        summary: "Коди вправ, уже призначених курсанту",
        responses: { 200: ok("Коди", success({ exerciseCodes: { type: "array", items: { type: "string" } } })), ...errors(400, 401, 403) },
      },
    },
    "/admin/group-schedule/document": {
      get: {
        tags: ["Плановий графік"],
        summary: "Графік черговості навчання водінню групи (Word)",
        parameters: [q("group", "Номер групи", { required: true })],
        responses: {
          200: {
            description: "Файл .docx",
            content: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { schema: { type: "string", format: "binary" } } },
          },
          ...errors(400, 401, 403, 404),
        },
      },
    },

    // ---------------- Курсанти ----------------
    "/admin/students": {
      get: {
        tags: ["Курсанти"],
        summary: "Список курсантів (адмін, бухгалтер)",
        parameters: [
          q("search", "Пошук за ПІБ або групою"),
          q("includeArchive", "true — разом з архівом"),
          date("endFrom", "Дата закінчення навчання від (разом з endTo)", false),
          date("endTo", "Дата закінчення навчання до", false),
        ],
        responses: { 200: ok("Курсанти", list("students", ref("Student"))), ...errors(400, 401, 403) },
      },
      post: {
        tags: ["Курсанти"],
        summary: "Додати курсанта (адмін, бухгалтер)",
        requestBody: body(ref("Student")),
        responses: { 201: ok("Створено", success({ student: ref("Student") })), ...errors(400, 401, 403) },
      },
    },
    "/admin/students/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Курсанти"],
        summary: "Редагувати курсанта; зміна передплати пишеться в історію з автором",
        requestBody: body(ref("Student")),
        responses: { 200: ok("Збережено", success({ student: ref("Student") })), ...errors(400, 401, 403, 404, 409) },
      },
      delete: {
        tags: ["Курсанти"],
        summary: "Видалити курсанта разом з його плановими заняттями (адмін)",
        responses: { 200: ok("Видалено", success()), ...errors(400, 401, 403, 404) },
      },
    },
    "/admin/students/{id}/details": {
      parameters: [idParam()],
      get: {
        tags: ["Курсанти"],
        summary: "Статистика занять курсанта за вправами",
        responses: { 200: ok("Деталі", success({ student: ref("Student"), exercises: { type: "array", items: { type: "object" } } })), ...errors(400, 401, 403, 404) },
      },
    },
    "/admin/students-summary": {
      get: {
        tags: ["Курсанти"],
        summary: "Зведена таблиця курсантів «Практика» за період (адмін)",
        parameters: [date("startDate", "Початок"), date("endDate", "Кінець")],
        responses: { 200: ok("Курсанти", list("students", ref("Student"))), ...errors(400, 401, 403) },
      },
    },

    // ---------------- Календар ----------------
    "/reminders": {
      get: {
        tags: ["Календар"],
        summary: "Картки на діапазон дат (до 400 днів)",
        parameters: [date("startDate", "Початок"), date("endDate", "Кінець")],
        responses: {
          200: ok("Серії та їх дати", success({ series: { type: "array", items: { type: "object" } }, occurrences: { type: "array", items: { type: "object" } } })),
          ...errors(400, 401),
        },
      },
      post: {
        tags: ["Календар"],
        summary: "Створити картку",
        requestBody: body(ref("ReminderInput")),
        responses: { 201: ok("Створено", success({ reminder: { type: "object" } })), ...errors(400, 401) },
      },
    },
    "/reminders/assignee-options": {
      get: {
        tags: ["Календар"],
        summary: "Можливі виконавці (ролі та інструктори)",
        responses: { 200: ok("Виконавці", success()), ...errors(401) },
      },
    },
    "/reminders/{id}": {
      parameters: [idParam()],
      put: {
        tags: ["Календар"],
        summary: "Редагувати картку (лише автор)",
        requestBody: body(ref("ReminderInput")),
        responses: { 200: ok("Збережено", success({ reminder: { type: "object" } })), ...errors(400, 401, 403, 404) },
      },
      delete: {
        tags: ["Календар"],
        summary: "Видалити картку (лише автор)",
        responses: { 200: ok("Видалено", success()), ...errors(400, 401, 403, 404) },
      },
    },
    "/reminders/due": {
      get: {
        tags: ["Календар"],
        summary: "Сповіщення, які треба показати зараз",
        responses: { 200: ok("Сповіщення", success({ due: { type: "array", items: { type: "object" } } })), ...errors(401) },
      },
    },
    "/reminders/{id}/acknowledge": {
      parameters: [idParam()],
      post: {
        tags: ["Календар"],
        summary: "Позначити сповіщення переглянутим",
        requestBody: body({ type: "object", required: ["triggerDate"], properties: { triggerDate: { type: "string", format: "date" } } }),
        responses: { 200: ok("Готово", success()), ...errors(400, 401, 403, 404) },
      },
    },
    "/reminders/{id}/snooze": {
      parameters: [idParam()],
      post: {
        tags: ["Календар"],
        summary: "Відкласти сповіщення на годину",
        responses: { 200: ok("Відкладено", success({ snoozeUntil: { type: "string", format: "date-time" } })), ...errors(401, 403, 404) },
      },
    },
  },
};
