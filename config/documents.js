// Реквізити для шапки "ЗАТВЕРДЖУЮ" у Word-графіку групи (utils/groupScheduleDocx.js).
// Значення можна змінити змінними середовища, не чіпаючи код.

const DOCUMENT_APPROVER = {
  position: process.env.DOC_APPROVER_POSITION || "Директор",
  organization: process.env.DOC_APPROVER_ORGANIZATION || "Знам’янського МСТК ТСОУ",
  name: process.env.DOC_APPROVER_NAME || "Володимир КОЛЕБІДЕНКО",
};

module.exports = { DOCUMENT_APPROVER };
