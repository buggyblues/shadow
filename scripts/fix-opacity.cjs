const fs = require('fs');

const files = [
  'apps/mobile/app/(main)/my-rentals.tsx',
  'apps/mobile/app/(main)/buddy-management.tsx',
  'apps/mobile/app/(main)/contract-detail/[contractId].tsx',
  'apps/mobile/app/(main)/create-listing/[listingId].tsx',
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Single-line: <Pressable style={styles.xxx} onPress=...>
    if (line.match(/<Pressable\b/) && line.match(/style=\{styles\.(\w+)\}/) && !line.includes('({pressed})')) {
      const newLine = line.replace(
        /style=\{styles\.(\w+)\}/,
        'style={({pressed}) => [styles.$1, {opacity: pressed ? 0.7 : 1}]}'
      );
      result.push(newLine);
      continue;
    }
    
    // Single-line: <Pressable style={[styles.xxx, {...}]}>
    if (line.match(/<Pressable\b/) && line.match(/style=\{\[/) && line.includes(']}') && !line.includes('({pressed})')) {
      const newLine = line.replace(
        /style=\{\[([^\]]+)\]\}/,
        'style={({pressed}) => [$1, {opacity: pressed ? 0.7 : 1}]}'
      );
      result.push(newLine);
      continue;
    }
    
    // Multi-line: <Pressable\n   style={styles.xxx}\n or style={[...]}\n
    if (line.match(/<Pressable\b/) && !line.includes('style=') && !line.includes('>')) {
      // Look ahead for style= on next few lines
      let found = false;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const sline = lines[j];
        if (sline.match(/^\s*style=\{styles\.(\w+)\}/) && !sline.includes('({pressed})')) {
          result.push(line);
          for (let k = i + 1; k < j; k++) {
            result.push(lines[k]);
          }
          result.push(sline.replace(
            /style=\{styles\.(\w+)\}/,
            'style={({pressed}) => [styles.$1, {opacity: pressed ? 0.7 : 1}]}'
          ));
          i = j;
          found = true;
          break;
        }
        if (sline.match(/^\s*style=\{\[/) && !sline.includes('({pressed})')) {
          // Multi-line style with [...] - find the closing ]}
          let styleBlock = sline;
          let endK = j;
          while (!styleBlock.includes(']}') && endK < lines.length - 1) {
            endK++;
            styleBlock += '\n' + lines[endK];
          }
          
          result.push(line);
          for (let k = i + 1; k < j; k++) {
            result.push(lines[k]);
          }
          
          // Replace the style block
          const newBlock = styleBlock.replace(
            /style=\{\[([^\]]*)\]\}/s,
            'style={({pressed}) => [$1, {opacity: pressed ? 0.7 : 1}]}'
          );
          const newBlockLines = newBlock.split('\n');
          for (const bl of newBlockLines) {
            result.push(bl);
          }
          i = endK;
          found = true;
          break;
        }
        // If we hit > without finding style, this Pressable has no style
        if (sline.includes('>') && !sline.includes('style=')) {
          // Add opacity style before the >
          result.push(line);
          for (let k = i + 1; k < j; k++) {
            result.push(lines[k]);
          }
          // Insert opacity style
          const indent = sline.match(/^(\s*)/)[1];
          result.push(indent + 'style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}');
          result.push(sline);
          i = j;
          found = true;
          break;
        }
      }
      if (!found) {
        result.push(line);
      }
      continue;
    }
    
    // Single-line <Pressable onPress={...}> with no style
    if (line.match(/<Pressable\s+onPress=/) && line.includes('>') && !line.includes('style=')) {
      const newLine = line.replace(
        />$/,
        ' style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>'
      ).replace(
        />\s*$/,
        ' style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>'  
      );
      result.push(newLine);
      continue;
    }
    
    result.push(line);
  }
  
  fs.writeFileSync(file, result.join('\n'));
  console.log(`Processed: ${file}`);
}
