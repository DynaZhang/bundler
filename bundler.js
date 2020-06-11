const fs = require('fs');    // node.js 文件模块
const path = require('path');   
const parser = require('@babel/parser');   // 将js代码字符串转换成抽象语法树（ast)
const traverse = require('@babel/traverse').default;  // 用来遍历更新@babel/parser生成的AST
const babel = require('@babel/core');   // babel的核心模块

/**
 * 模块分析
 * @param {文件名} filename 
 */
const moduleAnalyser = (filename) => {
  const dependencies = {};
  const content = fs.readFileSync(filename, 'utf-8');
  const ast = parser.parse(content,{
      sourceType: 'module'
  });
  traverse(ast, {
      ImportDeclaration({ node }){
          const dirname = path.dirname(filename);
          const dependency = node.source.value;
          const newFile = `./${path.join(dirname, dependency)}`;
          dependencies[dependency] = newFile;
      }
  });
  const { code } = babel.transformFromAst(ast, null, {
      presets: ["@babel/preset-env"]
  });
  return {
      filename,
      dependencies,
      code
  };
};

/**
 * 生成依赖图
 * @param {入口文件} entry 
 */
const makeDependenciesGraph = (entry) => {
  const entryModule = moduleAnalyser(entry);
  const graphQueue = [ entryModule ];
  const graph = {};

  while(graphQueue.length){
      const item = graphQueue.shift();
      const { dependencies, code } = item;
      if(dependencies){
          graph[item.filename] = {
              dependencies,
              code
          };
          for(let j in dependencies){  
              graphQueue.push(moduleAnalyser(dependencies[j]));
          }
      }
  }
  return graph;
};

/**
 * 生成代码
 * @param {入口文件} entry 
 */
const generateCode = (entry) => {
  const graph = JSON.stringify(makeDependenciesGraph(entry));
  return `
      (function(graph){
          function require(module) {
              function localRequire(relativePath){
                  return require(graph[module].dependencies[relativePath]);
              }
              let exports = {};
              (function(require, exports, code){
                  eval(code);
              })(localRequire, exports, graph[module].code)
              return exports;
          }
          require('${entry}');
      })(${graph})
  `;
};

const code = generateCode('./src/index.js')
console.log(code)