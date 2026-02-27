const fs = require('fs');
const path = require('path');
const { GeneratorEngine } = require('./generator');

class Pipeline {
  constructor(options = {}) {
    const schemaPath = options.schemaPath || path.join(__dirname, '..', 'schemas', 'web-generation-v1.json');
    this.generator = new GeneratorEngine(schemaPath);
  }

  collectInputFiles(inputDir) {
    const entries = fs.readdirSync(inputDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(inputDir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  }

  run(inputDir, outputRoot) {
    const resolvedInput = path.resolve(inputDir);
    const resolvedOutput = path.resolve(outputRoot);

    fs.mkdirSync(resolvedOutput, { recursive: true });

    const inputs = this.collectInputFiles(resolvedInput);
    const startedAt = new Date();
    const results = [];

    for (const inputPath of inputs) {
      const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      const slug = raw && raw.meta && raw.meta.brandSlug ? raw.meta.brandSlug : path.basename(inputPath, '.json');
      const outputDir = path.join(resolvedOutput, slug);
      const generation = this.generator.generate(inputPath, outputDir);

      const item = {
        inputPath,
        brandSlug: slug,
        success: generation.success,
        outputDir,
        errors: generation.errors || (generation.error ? [{ message: generation.error }] : [])
      };

      if (generation.previewUrl) {
        item.previewUrl = generation.previewUrl;
      }

      results.push(item);
    }

    const succeeded = results.filter((result) => result.success).length;
    const failed = results.length - succeeded;
    const finishedAt = new Date();

    const report = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total: results.length,
      succeeded,
      failed,
      results
    };

    const reportPath = path.join(resolvedOutput, 'pipeline-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return {
      ...report,
      reportPath
    };
  }
}

module.exports = {
  Pipeline
};

if (require.main === module) {
  const [, , inputArg, outputArg] = process.argv;
  const inputDir = inputArg ? path.resolve(process.cwd(), inputArg) : path.resolve(process.cwd(), 'samples');
  const outputRoot = outputArg ? path.resolve(process.cwd(), outputArg) : path.resolve(process.cwd(), 'build-output');

  const pipeline = new Pipeline();
  const result = pipeline.run(inputDir, outputRoot);

  console.log(JSON.stringify(result, null, 2));

  if (result.failed > 0) {
    process.exit(1);
  }
}
