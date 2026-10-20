import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build } from 'esbuild';
import postcss from 'postcss';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function originalNavigation(css) {
  // Validate parsed rules, rather than finding selectors inside broken CSS text.
  const tree = postcss.parse(css);
  for (const [selector, expected] of Object.entries({
    '.masthead': { position: 'fixed', top: '0', right: '0', left: '0', height: '72px', display: 'flex', background: '#f9f4edf5' },
    '.nav-actions': { display: 'flex', 'align-items': 'center', gap: '10px', 'flex-shrink': '0' },
    ':root': { '--paper': '#f7f6f1', '--ink': '#293243', '--yellow': '#efc866' },
  })) {
    const rules = [];
    tree.walkRules(selector, rule => rules.push(rule));
    assert.equal(rules.length, 1, `Expected one original ${selector} rule`);
    for (const [property, value] of Object.entries(expected)) {
      assert(rules[0].nodes.some(node => node.type === 'decl' && node.prop === property && node.value === value), `${selector}: ${property} must remain ${value}`);
    }
  }
  return tree;
}

async function embedFonts(tree) {
  const references = new Map();
  tree.walkAtRules('import', () => {
    assert.fail('Standalone CSS cannot depend on an imported stylesheet');
  });
  tree.walkAtRules('font-face', face => {
    face.walkDecls('src', declaration => {
      const urls = [...declaration.value.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^\s)]+))\s*\)/g)];
      assert(urls.length, 'Each font face must have an explicit WOFF2 source');
      for (const match of urls) {
        const url = match[2] ?? match[3];
        assert(/^\/fonts\/[A-Za-z0-9][A-Za-z0-9._-]*\.woff2$/.test(url), 'Standalone fonts must use local public/fonts WOFF2 files');
        if (!references.has(url)) references.set(url, []);
        references.get(url).push({ declaration, original: match[0] });
      }
    });
  });
  assert(references.size, 'The original typography must be available as local fonts');
  for (const [url, uses] of references) {
    const bytes = await readFile(path.join(projectRoot, 'public', url.slice(1)));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', `${url} must contain a WOFF2 font`);
    const embedded = `url("data:font/woff2;base64,${bytes.toString('base64')}")`;
    for (const { declaration, original } of uses) declaration.value = declaration.value.replaceAll(original, embedded);
  }
  return references.size;
}

export async function exportStandalone(outputPath) {
  assert(outputPath, 'Provide an output HTML path');
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: ['src/main.js'],
    outfile: 'standalone.js',
    bundle: true,
    minify: true,
    target: 'es2022',
    format: 'iife',
    // Vite serves these public assets as URLs. Retain them while bundling,
    // then put their bytes directly in the portable document below.
    external: ['/fonts/*'],
    write: false,
    logLevel: 'silent',
  });
  let js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const compiledCss = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  assert(js && compiledCss, 'The application bundle must contain JavaScript and CSS');

  const compiled = postcss.parse(compiledCss);
  const fontAssets = await embedFonts(compiled);
  const combined = postcss.root();
  combined.append(...postcss.parse(await readFile(path.join(projectRoot, 'public/viewport.css'), 'utf8')).nodes);
  combined.append(...compiled.nodes);
  const css = combined.toString();
  originalNavigation(css);
  assert(!/https?:\/\//i.test(css), 'Standalone styling cannot require an external connection');
  assert(!/\/fonts\//.test(css), 'Standalone font bytes must be embedded');
  assert(!/<\/style/i.test(css), 'CSS cannot terminate the inline style element');

  const audioDirectory = path.join(projectRoot, 'public/audio');
  const audioNames = (await readdir(audioDirectory)).filter(name => /^(?:background\.mp3|step-[1-4]\.wav|dismiss\.wav|click\.wav|fight-[1-3]\.wav)$/.test(name)).sort();
  assert.equal(audioNames.length, 10, 'All ten runtime audio assets must be present');
  const declarations = [];
  for (const [index, name] of audioNames.entries()) {
    const literal = JSON.stringify(`/audio/${name}`);
    assert(js.includes(literal), `The runtime bundle must reference ${name}`);
    const mime = name.endsWith('.mp3') ? 'mpeg' : 'wav';
    const audio = await readFile(path.join(audioDirectory, name));
    const variable = `__COMMON_GROUND_AUDIO_${index}__`;
    declarations.push(`const ${variable}=${JSON.stringify(`data:audio/${mime};base64,${audio.toString('base64')}`)};`);
    js = js.replaceAll(literal, variable);
  }
  js = (declarations.join('') + js).replace(/<\/script/gi, '<\\/script');
  const boot = `(()=>{const desktop=window.matchMedia('(min-width: 1280px)');let started=false;function boot(){if(!desktop.matches||started)return;started=true;try{\n${js}\n}catch(error){console.error(error);const loading=document.getElementById('loading');if(loading)loading.textContent='The experience couldn’t load. Please refresh to try again.';}}desktop.addEventListener('change',boot);boot();})();`;
  new Script(boot, { filename: 'standalone-inline.js' });
  assert(!/\bimport\s*\(/.test(boot), 'Standalone JavaScript cannot contain dynamic imports');
  assert(!/\/audio\/(?:background\.mp3|(?:step-[1-4]|fight-[1-3]|dismiss|click)\.wav)/.test(boot), 'Runtime audio must be embedded');

  let html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  const stylesheetTag = '<link rel="stylesheet" href="/viewport.css" />';
  const scriptTag = '<script type="module" src="/src/bootstrap.js"></script>';
  assert.equal(html.split(stylesheetTag).length, 2, 'Expected one viewport stylesheet link');
  assert.equal(html.split(scriptTag).length, 2, 'Expected one bootstrap script');
  html = html.replace(stylesheetTag, () => `<style>${css}</style>`)
    .replace(scriptTag, () => `<script>${boot}</script>`)
    .replace('class="brand" href="/"', 'class="brand" href="#"');
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(html), 'No external scripts are permitted');
  assert.equal((html.match(/<header\b/g) || []).length, 1, 'Expected one original header');
  assert.equal((html.match(/<nav\b/g) || []).length, 1, 'Expected one original navigation');
  assert.equal((html.match(/id="music-toggle"/g) || []).length, 1, 'The shared sound control must remain available');
  // Reparse the actual HTML payload, including its viewport guard, before writing.
  originalNavigation(html.match(/<style>([\s\S]*?)<\/style>/)[1]);
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
  return { output: target, bytes: Buffer.byteLength(html), audioAssets: audioNames.length, fontAssets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await exportStandalone(process.argv[2])));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
