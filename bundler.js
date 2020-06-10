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
  const content = fs.readFileSync(filename, 'utf-8');   // 获取文件内容
  const ast = parser.parse(content, {
    sourceType: 'module'
  })  // 分析js文件，转换成ast(抽象语法树)
  const dependencies = {};
  traverse(ast, {
    ImportDeclaration({ node }) {
      const dirname = path.dirname(filename)
      // const newFile = path.join(dirname,node.source.value)  // 获取依赖所在的绝对路径
      const newFile = './' + path.join(dirname,node.source.value)  // 获取依赖所在的相对路径(相对于bunlder文件夹)
      dependencies[node.source.value] = newFile  // 获取依赖的文件名
    }
  })
  const { code } = babel.transformFromAst(ast, null, {
    presets: ['@babel/preset-env']
  })
  return {
    filename,
    dependencies,
    code
  }
}

/**
 * 生成依赖图
 * @param {入口文件} entry 
 */
const makeDependenciesGraph = (entry) => {
  const entryModule = moduleAnalyser(entry)
  const graphArr = [entryModule];
  for(let i = 0; i < graphArr.length; i++) {
    const item = graphArr[i]
    const { dependencies } = item
    if (dependencies) {
      for (const key in dependencies) {
        graphArr.push(moduleAnalyser(dependencies[key]))
      }
    }
  }
  const graph = {}
  graphArr.forEach(item => {
    graph[item.filename] = {
      dependencies: item.dependencies,
      code: item.code
    }
  })
  return graph
}

/**
 * 生成代码
 * @param {入口文件} entry 
 */
const generateCode = (entry) => {
  const graph = JSON.stringify(makeDependenciesGraph(entry))
  console.log(graph)
  return `
    (function(graph) {
      function require(module) {
        function localRequire(relativePath) {
          require(graph[module].dependencies[relativePath]);
        }
        var exports = {};
        (function(require,exports,code){
          eval(code)
        })(localRequire, exports, graph[module].code)
        return exports;
      }
      require('${entry}')
    })(${graph})
  `;

}

const code = generateCode('./src/index.js')
console.log(code)