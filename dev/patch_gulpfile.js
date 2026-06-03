const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'vscode', 'build', 'gulpfile.vscode.ts');
if (!fs.existsSync(file)) {
  console.error(`Error: ${file} does not exist.`);
  process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');

// Match the specific rcedit call within patchWin32DependenciesTask
const regex = /(\t*)await rcedit\(path\.join\(cwd, dep\), \{[\s\S]+?\}\);\r?\n/;

if (regex.test(content)) {
  content = content.replace(regex, (match, indent) => {
    return indent + 'try {\n' +
           indent + '\tawait rcedit(path.join(cwd, dep), {\n' +
           indent + '\t\t\'file-version\': baseVersion,\n' +
           indent + '\t\t\'version-string\': {\n' +
           indent + '\t\t\t\'CompanyName\': \'Microsoft Corporation\',\n' +
           indent + '\t\t\t\'FileDescription\': product.nameLong,\n' +
           indent + '\t\t\t\'FileVersion\': packageJson.version,\n' +
           indent + '\t\t\t\'InternalName\': basename,\n' +
           indent + '\t\t\t\'LegalCopyright\': \'Copyright (C) 2026 Microsoft. All rights reserved\',\n' +
           indent + '\t\t\t\'OriginalFilename\': basename,\n' +
           indent + '\t\t\t\'ProductName\': product.nameLong,\n' +
           indent + '\t\t\t\'ProductVersion\': packageJson.version,\n' +
           indent + '\t\t}\n' +
           indent + '\t});\n' +
           indent + '} catch (err) {\n' +
           indent + '\tconsole.warn(`Warning: Could not patch metadata for ${dep}:`, err);\n' +
           indent + '}\n';
  });
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully patched vscode/build/gulpfile.vscode.ts for rcedit robustness.');
} else {
  console.warn('Warning: rcedit pattern not found in vscode/build/gulpfile.vscode.ts.');
}
