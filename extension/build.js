/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Dependencies

var path = require("path");
var fs = require("fs");
var shell = require("shelljs");
var copy = require("dryice").copy;
var os = require("os");
var spawn = require("child_process").spawn;

// ********************************************************************************************* //

function help()
{
    console.log('Usage:');
    console.log('');
    console.log('1. In order to build Firebug (including tracing) xpi run:');
    console.log('       $ node build.js');
    console.log('   The final xpi + update.rdf file will be located in the \'release\' sub directory.');
    console.log('');
    console.log('   If GETFIREBUG is properly specified in content/firebug/branch.properties');
    console.log('   (it assumes you have fbug and getfirebug.com directories at the same level)');
    console.log('   The xpi + update.rdf will be also deployed for you there and so you can');
    console.log('   just commit.');
    console.log('');
    console.log('   The release directory should contain two files:');
    console.log('   - firebug<version>.xpi (including updateURL) for getfirebug.com');
    console.log('   - firebug<version>-amo.xpi (disabled update) for AMO');
    console.log('');
    /*
    TODO: There were no targets for release ...
    console.log('2. In order to build Firebug final release (no tracing) run:');
    console.log('       $ node build.js release');
    console.log('   Again xpi files will be located in the \'release\' directory.');
    console.log('');
    */
    console.log('2. To check GETFIREBUG value run:');
    console.log('       $ node build.js echo');
    console.log('');
    console.log('3. To build xpi and generate JS doc (from source comments) run:');
    console.log('       $ node build.js jsdoc');
    console.log('');
    console.log('4. To build xpi for Babelzilla run:');
    console.log('       $ node build.js bz');
    console.log('   - All BZ locales should be stored in "bz-locale" directory.');
}

// ********************************************************************************************* //

function main()
{
    var args = process.argv;

    if (args.length < 3)
        build();
    else if (args.length >= 4 || args[2] === "help")
        help();
    else if (args[2] === "echo")
        echo();
    else if (args[2] === "jsdoc")
        jsdoc();
    else if (args[2] === "bz")
        bz();
    else if (args[2] === "clean")
        clean();
    else
        help();
}

// ********************************************************************************************* //
// Globals

// <property file="content/firebug/branch.properties"/>
var getfirebugDir = "none";
var packageFile = fs.readFileSync(__dirname + "/package.json", "utf8");
var versionString = JSON.parse(packageFile).version;

// Parse Firebug version string (e.e. "1.10.0a5" -> version: "1.10", release ".0a5")
var result = versionString.match(/^(\d+\.\d+)?(\S*)$/);
if (result.length != 3)
    throw new Error("Wrong version string!");

var version = result[1];
var release = result[2];

// Compute various target directories.
var buildDir = "./build";
var releaseDir = "./release";
var deployXpiDir = getfirebugDir + "/releases/firebug/" + version + "";
var deployJsdocDir = getfirebugDir + "/developer/api/firebug" + version + "";
var bzLocaleDir = "./bz-locale";

var deployDirAvailable = path.existsSync(getfirebugDir) && fs.statSync(getfirebugDir).isDirectory;

// ********************************************************************************************* //

function prepareBuild()
{
    shell.mkdir(buildDir);
    shell.mkdir(releaseDir);

    // Copy non JS resources
    copy({
        source: {
            root: '.',
            // TODO: Previously we copied everything that matched this set of
            // extensions: js, xul, properties, css, html, xml, dtd, ong, gif, ico,
            //      manifest, txt, html
            // and then deleted. Now we copy everything with exclusions, but
            // we don't know what extra exclusions were missing
            exclude: [
                /.*\.graphml/, /build\.xml/, /node_modules/, /build\.js/,
                /install\.rdf\.tpl\.xml/, /update\.rdf\.tpl\.xml/
            ]
        },
        dest: buildDir
    });

    var project = copy.createCommonJsProject({
        roots: [
            __dirname + "/content"
        ],
        aliases: {
            "arch": "firebug/bti/inProcess"
        }
    });

    copy({
        source: [
            //copy.getMiniRequire(),
            {
                project: project,
                require: [
                    "firebug/chrome/chrome",
                    "firebug/lib/lib",
                    "firebug/firebug",
                    "firebug/bti/inProcess/browser",
                    "firebug/trace/traceModule",
                    "firebug/chrome/navigationHistory",
                    "firebug/chrome/knownIssues",
                    "firebug/chrome/shortcuts",
                    "firebug/firefox/start-button/startButtonOverlay",
                    "firebug/firefox/external-editors/externalEditors",
                    "firebug/firefox/firebugMenu",
                    "firebug/chrome/panelActivation",
                    "firebug/chrome/tableRep",
                    "firebug/html/htmlPanel",
                    "firebug/console/commandLinePopup",
                    "firebug/accessible/a11y",
                    "firebug/console/consoleInjector",
                    "firebug/net/spy",
                    "firebug/net/tabCache",
                    "firebug/chrome/activation",
                    "firebug/css/stylePanel",
                    "firebug/css/computedPanel"
                ],
            },
            __dirname + "/content/firebug/main.js"
        ],
        filter: moduleDefines,
        dest: buildDir + "/content/firebug/main.js"
    });

    // Compress main.js file (all extension modules)
    // xxxHonza: do not use uglify for build, there is missing ';' somewhere
    /*copy({
        source: buildDir + "/content/firebug/main.js",
        filter: copy.filter.uglifyjs,
        dest: buildDir + "/content/firebug/main.js"
    });*/

    /*copy({
        source: {value:project.getDependencyGraphML()},
        dest: "netpanel.graphml"
    });*/

    // Copy install.rdf template into the build dir
    copy({
        source: "install.rdf.tpl.xml",
        dest: buildDir + "/install.rdf"
    });
}

// ********************************************************************************************* //

/**
 * Munge define lines to add module names
 */
function moduleDefines(input, source)
{
    if (!source)
    {
        console.log("- Source without filename passed to moduleDefines()." +
            " Skipping addition of define(...) wrapper.");
        console.log(input.substr(0, 300));
        return input;
    }

    input = (typeof input !== 'string') ? input.toString() : input;
    var deps = source.deps ? Object.keys(source.deps) : [];
    deps = deps.length ? (", '" + deps.join("', '") + "'") : "";

    var module = source.isLocation ? source.path : source;
    module = module.replace(/\.js$/, '');

    return input.replace(/define\(\[/, 'define("' + module + '", [');
};

moduleDefines.onRead = true;

// ********************************************************************************************* //

/**
 * Build Firebug XPI
 */
function build()
{
    clean();
    prepareBuild();

    // Update install.rdf with updated release version info
    copy({
        source: buildDir + "/install.rdf",
        filter: function(data) {
            return data
                .replace(/@VERSION@/gm, version)
                .replace(/@RELEASE@/gm, release);
        },
        dest: buildDir + "/install.rdf"
    });

    // Remove template for manifest file that is used for Babelzilla builds
    shell.rm(buildDir + "/chrome.bz.tpl.manifest");

    // Create XPI for getfirebug.com (zipping is asynchronous)
    createFirebugXPI("firebug-" + version + release + ".xpi", function()
    {
        // Remove update URL, it's needed only for alpha versions. All the other
        // versions updates from AMO.
        copy({
            source: buildDir + "/install.rdf",
            filter: function(data)
            {
                var re = new RegExp("(.*)https:\/\/getfirebug.com\/releases\/firebug\/" +
                    version + "\/update.rdf(.*)");
                return data.replace(re, '');
            },
            dest: buildDir + "/install.rdf"
        });

        // Create XPI for AMO (no update URL)
        createFirebugXPI("firebug-" + version + release + "-amo.xpi", function()
        {
            shell.rm("-rf", buildDir);

            deploy();

            console.log("Firebug version: " + version + release + " in " + releaseDir);
        });
    });
}

// ********************************************************************************************* //

/**
 * Create final xpi package
 */
function createFirebugXPI(filename, callback)
{
    zip(releaseDir + "/" + filename, buildDir, callback);

    copy({
        source: 'update.rdf.tpl.xml',
        filter: function(data) {
            return data
                .replace(/@VERSION@/gm, version)
                .replace(/@RELEASE@/gm, release)
                .replace(/@LEAF@/gm, "firebug-" + version + release + ".xpi");
        },
        dest: releaseDir + "/update.rdf"
    });
}

// ********************************************************************************************* //

function deploy()
{
    if (deployDirAvailable) {
        /*
        <copy file="${releaseDir}/update.rdf" todir="${deployXpiDir}" overwrite="true"/>
        <copy file="${releaseDir}/firebug-" + version + release + ".xpi" todir="${deployXpiDir}" overwrite="true"/>
        <copy file="${releaseDir}/firebug-" + version + release + "-amo.xpi" todir="${deployXpiDir}" overwrite="true"/>
        <echo message="XPI deployed to: " + version + release + " to ${deployXpiDir}"/>
        */
    }
}

// ********************************************************************************************* //

function echo()
{
    console.log("Build directory: " + buildDir);
    console.log("Deploy directory: " + getfirebugDir + " available: " + deployDirAvailable);
}

// ********************************************************************************************* //

/**
 * Support for generating docs from Firebug source code using js-doc-toolkit
 * See the output in $svn/jsdoc/out directory
 */
function jsdoc()
{
    build();
    /*
    <property name="jsdoc.dir" value="../../jsdoc/"/>
    <property name="jsdoc-toolkit.dir" value="${jsdoc.dir}/jsdoc-toolkit-2.3.0/"/>
    <property name="jsdoc-output.dir" value="${releaseDir}/jsdoc/"/>

    <path id="jsdoctoolkit">
        <!-- Rhino js.jar 1.7.R2 must be used with jsdoctoolkit-ant-task-1.0.1.jar -->
        <fileset dir="${jsdoc.dir}" includes="*.jar"/>
    </path>

    <taskdef name="jsdoctoolkit"
        classpathref="jsdoctoolkit"
        classname="uk.co.darrenhurley.ant.tasks.JsDocToolkit"/>

    <echo message="Generate doc from Firebug source."/>

    <!-- Clean the output direcotory -->
    <delete dir="${jsdoc-output.dir}"/>

    <!-- Parse all source files -->
    <jsdoctoolkit jsdochome="${jsdoc-toolkit.dir}"
        template="firebug"
        outputdir="${jsdoc-output.dir}"
        inputdir="." />
    */
    deployJsdoc();
}

// ********************************************************************************************* //

function deployJsdoc()
{
    if (deployDirAvailable) {
        /*
        <copy todir="${deployJsdocDir}">
            <fileset dir="${releaseDir}/jsdoc"/>
        </copy>

        <echo message="JSDoc deployed to: " + version + release + " to ${deployXpiDir}"/>
         */
    }
}

// ********************************************************************************************* //

function bz()
{
    clean();
    prepareBuild();
    /*
    <!-- Use Babelzila manifest file (with all locales) -->
    <copy file="chrome.bz.tpl.manifest" tofile="${buildDir}/chrome.manifest"
        overwrite="true"/>
    <delete file="${buildDir}/chrome.bz.tpl.manifest"/>

    <!-- Use all BZ locales -->
    <copy todir="${buildDir}/locale" overwrite="true">
        <fileset dir="${bzLocaleDir}">
           <include name="**[      ]/*.properties"/>
           <exclude name="en-US/*.properties"/>
        </fileset>
    </copy>

    <!-- Modify version number (append BZ) -->
    <replace file="${buildDir}/install.rdf" propertyFile="content/firebug/branch.properties">
        <replacefilter token="@version@" value="" + version + "" />
        <replacefilter token="@RELEASE@" value="" + release + "-bz" />
    </replace>

    <!-- Delete the helper dir with Babelzilla locales from the build directory -->
    <delete dir="${buildDir}/${bzLocaleDir}" />

    <!-- Create XPI for getfirebug.com -->
    <antcall target="createFirebugXPI">
        <param name="file-name" value="firebug-" + version + release + "-bz.xpi" />
    </antcall>

    <delete dir="${buildDir}" />

    <echo message="Firebug Release for Babelzilla: " + version + release + "-bz in ${releaseDir}" />
    */
}

// ********************************************************************************************* //

function clean()
{
    shell.rm("-rf", buildDir);
    shell.rm("-rf", releaseDir);
}

// ********************************************************************************************* //

function zip(filename, directory, callback)
{
    // Create final XPI package.
    var zip = null;
    if (os.platform() === "win32")
    {
        var params = "a -tzip " + filename + " " + directory + "/*";
        zip = spawn("7z.exe", params.split(" "), { cwd: "." });
    }
    else
    {
        // not tested
        //zip = spawn("zip", [ "-r", __dirname + "/" + xpiFileName, release ]);
    }

    if (zip)
    {
        zip.on("exit", function()
        {
            callback();
        });
    }
    else
    {
        callback();
    }
}

// ********************************************************************************************* //
// Startup

main();

// ********************************************************************************************* //
