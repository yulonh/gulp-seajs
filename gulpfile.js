var gulp = require('gulp'),
  clean = require('gulp-clean'),
  runSeq = require('run-sequence'),
  transport = require('./gulp-cmd-transport'),
  path = require('path'),
  uglify = require('gulp-uglify'),
  concat = require('gulp-concat'),
  rename = require('gulp-rename'),
  crypto = require('crypto'),
  through2 = require('through2'),
  spawn = require('child_process').spawn,
  os = require('os');

/*********************************
 *********可以配置参数************
 *********************************/
var dest = '../../web'; // 构建生成目录，相对当前文件
var idleading = '/web/js/'; //模块ID前缀
var src = '../../web'; // 需要构建的源码位置


//获取html页面引用的js
function getUseJs(file) {
  var content = file.contents.toString();
  var use = content.match(/seajs\.use\(['"](.*)['"]/);
  use = use && use[1];
  if (!use) {
    return false;
  }
  return path.resolve(path.dirname(file.path), use) + '.js';
}

//获取依赖
function pasreDependencies(file) {
  var content = file.contents.toString();
  var dependencies = content.match(/define\("[\.\w\/]+"\s*\,\s*(.*)\s*\,\s*function/);
  dependencies = dependencies && dependencies[1];
  dependencies = new Function('return ' + dependencies)();
  if (dependencies) {
    dependencies = dependencies.map(function(val) {
      return path.resolve(path.dirname(file.path), val) + '.js';
    });
  }
  return dependencies;
}

//SVN 更新
gulp.task('update', function(cb) {
  var svnCMD = os.platform().indexOf('win') !== -1 ? 'svn.exe' : 'svn';
  var svn = spawn(svnCMD, ['update', src]);
  svn.stdout.setEncoding('utf8');
  svn.stdout.on('data', function(data) {
    console.log('svn update process:', data);
  });

  svn.stdout.on('end', function(data) {
    console.log('svn update end:', data);
    cb && cb();
  });

  svn.on('error', function(e) {
    console.log(e);
  });
});

//SVN 还原
gulp.task('revert', function(cb) {
  var svnCMD = os.platform().indexOf('win') !== -1 ? 'svn.exe' : 'svn';
  var svn = spawn(svnCMD, ['revert', '-R', src]);
  svn.stdout.setEncoding('utf8');
  svn.stdout.on('data', function(data) {
    console.log('svn update process:', data);
  });

  svn.stdout.on('end', function(data) {
    console.log('svn update end:', data);
    cb && cb();
  });

  svn.on('error', function(e) {
    console.log(e);
  });
});

//清除,权限问题build目录外的文件无效
gulp.task('clean', function() {
  return gulp.src(dest, {
    read: false
  }).pipe(clean());
});

//转换js,添加ID和依赖
gulp.task('transport-js', function(cb) {

  return gulp.src('**/*.js', {
    cwd: '../js'
  }).pipe(transport({
    idleading: idleading
  })).pipe(gulp.dest(dest + '/js'));

});

//复制html到目标目录以便下一步操作
gulp.task('copy-html', function() {
  return gulp.src('../*.html').pipe(gulp.dest(dest));
});

//处理html,替换seajs配置，添加版本号
gulp.task('transport-html', function() {

  return gulp.src(dest + '/*.html').pipe(through2.obj(function(file, enc, cb) {
    if (!file.isNull()) {
      var content = file.contents.toString();
      //替换配置,添加版本号
      content = content.replace(/seajs\.config\(\{[\w\W]*(?:\}\))+?/, 'seajs.config({map:[[/^(.*\\/js.*?\.js)(?:.*)$/i,' +
        '"$1?v=' + new Date().getTime() + '"]]})');

      file.contents = new Buffer(content);
      this.push(file);
    }
    cb();
  })).pipe(gulp.dest(dest));

});

//业务代码和依赖模块合并
gulp.task('concat', function(cb) {
  return gulp.src(dest + '/*.html').on('data', function(file) {
    var realPath = getUseJs(file); //读取HTML文件，获取入口js文件路径
    var basename = path.basename(realPath);
    var dirname = path.dirname(realPath);

    false !== realPath && gulp.src(realPath).on('data', function(file) {

      var dependencies = pasreDependencies(file); //获取依赖模块

      if (dependencies) {
        gulp.src(dependencies.concat(realPath))
          .pipe(concat(basename.replace(/(\w+)(\.\w+)/, '$1-debug$2'))) //合并后压缩前的文件为xxxxx-debug.js
          .pipe(gulp.dest(dirname));
      }
    });
  });
});

//压缩
gulp.task('minify', function() {

  return gulp.src(dest + '/**/*-debug.js').pipe(uglify())
    .pipe(rename(function(path) {
      path.basename = path.basename.replace('-debug', ''); // 压缩后还原文件名
    }))
    .pipe(gulp.dest(dest));

});

//css处理，目前直接复制,后期合并压缩
gulp.task('css', function() {
  return gulp.src('../css/**/*.css').pipe(gulp.dest(dest + '/css'));
});
//图片处理,目前直接复制,后期合并压缩
gulp.task('images', function() {
  return gulp.src(['../images/*.*', '../images/**/*.*']).pipe(gulp.dest(dest + '/images'));
});
//字体处理
gulp.task('font', function() {
  return gulp.src('../font/*.*').pipe(gulp.dest(dest + '/font'));
});

//默认任务，子任务顺序执行,为了能使ruqSeq顺序执行任务，每个子任务必须里return ;
gulp.task('default', function() {
  runSeq('revert', 'transport-js', 'copy-html', 'concat', 'minify', 'transport-html', ['css', 'images', 'font']);
});