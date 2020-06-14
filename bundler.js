const fs = require('fs');    // node.js 文件模块
const path = require('path');   // node.js path模块
const parser = require('@babel/parser');   // 将js代码字符串转换成抽象语法树（ast)
const traverse = require('@babel/traverse').default;  // 用来遍历更新@babel/parser生成的AST,
// traverse 采用的 ES Module 导出，我们通过 requier 引入的话就加个 .default

const babel = require('@babel/core');   // babel的核心模块

/**
 * 模块分析
 * @param {文件名} filename 
 */
const moduleAnalyser = (filename) => {
  const dependencies = {}; // 依赖收集
  const content = fs.readFileSync(filename, 'utf-8');  // 读取js文件
  const ast = parser.parse(content,{  // 转换成AST
      sourceType: 'module'   // 如果模块规范是ESModule, 就配置sourceType为module
  });
  traverse(ast, {
      ImportDeclaration({ node }){ // 函数名是 AST 中包含的内容，参数是一些节点，node 表示这些节点下的子内容
          const dirname = path.dirname(filename); // 我们从抽象语法树里面拿到的路径是相对路径，然后我们要处理它，在 bundler.js 中才能正确使用
          const dependency = node.source.value;  // 保存模块的依赖
          const newFile = `./${path.join(dirname, dependency)}`;  // 将dirname 和 获取到的依赖联合生成绝对路径
          dependencies[dependency] = newFile;  // 将源路径和新路径以 key-value 的形式存储起来
      }
  });
  // 利用babel,将抽象语法树转换成浏览器可以运行的代码
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
 * 生成依赖图，递归遍历所有依赖模块
 * @param {入口文件} entry 
 */
const makeDependenciesGraph = (entry) => {
  const entryModule = moduleAnalyser(entry);
  const graphQueue = [ entryModule ]; // 首先将我们分析的入口文件结果放入图谱数组中
  const graph = {}; // 拿到当前模块所依赖的模块

  while(graphQueue.length){
      const item = graphQueue.shift();
      const { dependencies, code } = item;
      if(dependencies){
          graph[item.filename] = {
              dependencies,
              code
          };
          for(let j in dependencies){   // 通过 for-in 遍历对象
              graphQueue.push(moduleAnalyser(dependencies[j])); // 如果子模块又依赖其它模块，就分析子模块的内容
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
  // 注意：我们的 gragh 是一个对象，key是我们所有模块的绝对路径，需要通过 JSON.stringify 来转换
  const graph = JSON.stringify(makeDependenciesGraph(entry));
  // webpack 是将我们的所有模块放在闭包里面执行的，所以我们写一个自执行的函数
  // 注意: 我们生成的代码里面，都是使用的 require 和 exports 来引入导出模块的，而我们的浏览器是不认识的，所以需要构建这样的函数
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