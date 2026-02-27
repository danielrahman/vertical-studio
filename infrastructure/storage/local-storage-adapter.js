const fs = require('fs');
const path = require('path');

function listFilesRecursively(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const stack = [baseDir];
  const files = [];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

class LocalStorageAdapter {
  writeArtifact(targetPath, content) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(targetPath, content);
    } else {
      fs.writeFileSync(targetPath, String(content));
    }

    return {
      path: targetPath
    };
  }

  readArtifact(filePath, encoding = 'utf8') {
    return fs.readFileSync(filePath, encoding);
  }

  listArtifacts(outputDir) {
    return listFilesRecursively(outputDir).map((filePath) => {
      const stat = fs.statSync(filePath);
      return {
        name: path.relative(outputDir, filePath),
        path: filePath,
        size: stat.size
      };
    });
  }
}

module.exports = {
  LocalStorageAdapter
};
