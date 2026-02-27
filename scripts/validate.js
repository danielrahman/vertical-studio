const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const [, , inputArg] = process.argv;

if (!inputArg) {
  console.error('Usage: node scripts/validate.js <input.json>');
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);
const schemaPath = path.join(__dirname, '..', 'schemas', 'web-generation-v1.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

if (input && input.meta && typeof input.meta === 'object') {
  if (!input.meta.locale && input.meta.Locale) {
    input.meta.locale = input.meta.Locale;
  }
}

if (!validate(input)) {
  console.error('Validation failed:');
  for (const error of validate.errors || []) {
    console.error(`- ${error.instancePath || '/'} ${error.message}`);
  }
  process.exit(1);
}

console.log(`Validation passed: ${inputPath}`);
