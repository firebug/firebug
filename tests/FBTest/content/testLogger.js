/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //

var TestLogger =
{
    getDefaultFile: function(date)
    {
        function f(n, c) {
            if (!c) c = 2;
            var s = new String(n);
            while (s.length < c) s = "0" + s;
            return s;
        }

        var fileName = "firebug-" +
            Firebug.version + "-" +
            date.getFullYear() + "-" + f(date.getMonth()+1) + "-" + f(date.getDate()) +
            "+" + f(date.getHours()) + "-" + f(date.getMinutes());

        var file = this.getDefaultFolder();
        file.append(fileName + ".log");
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

        return file;
    },

    getOutputStream: function(date)
    {
        var file = this.getDefaultFile(date);
        var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Ci.nsIFileOutputStream);
        foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

        var convertor = Cc["@mozilla.org/intl/converter-output-stream;1"]
            .createInstance(Ci.nsIConverterOutputStream);

        convertor.init(foStream, "UTF-8", 0, 0);
        return convertor;
    },

    getSystemInfo: function()
    {
        var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
        var currLocale = Firebug.getPref("general.useragent", "locale");
        var systemInfo = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag);
        var osName = systemInfo.getProperty("name");
        var osVersion = systemInfo.getProperty("version");

        return {
            fbTest: FBTestApp.TestConsole.getVersion(),
            firebug: Firebug.getVersion(),
            appName: appInfo.name,
            appVersion: appInfo.version,
            appPlatform: appInfo.platformVersion,
            appBuildID: appInfo.appBuildID,
            locale: currLocale,
            osName: osName,
            osVersion: osVersion,
        };
    },

    getDefaultFolder: function()
    {
        var dir;
        var path = Firebug.getPref(FBTestApp.prefDomain, "defaultLogDir");
        if (!path)
        {
            // Create default folder for automated logs.
            var dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
            var dir = dirService.get("ProfD", Ci.nsIFile);
            dir.append("firebug");
            dir.append("fbtest");
            dir.append("logs");
        }
        else
        {
            dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            dir.initWithPath(path);
        }

        return dir;
    }
};

// ********************************************************************************************* //
// Test Runner Progress Listener

TestLogger.ProgressListener = function(date)
{
    this.startedTime = date;
};

TestLogger.ProgressListener.prototype =
{
    onTestSuiteStart: function(tests)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtrace.ProgressListener; onTestSuiteStart " + tests.length, tests);

        this.stream = TestLogger.getOutputStream(this.startedTime);
        if (!this.stream)
            return;

        // Log system configuration
        var info = TestLogger.getSystemInfo();
        this.stream.writeString("FIREBUG INFO | Firebug: " + info.firebug + "\n");
        this.stream.writeString("FIREBUG INFO | FBTest: " + info.fbTest + "\n");
        this.stream.writeString("FIREBUG INFO | App Name: " + info.appName + "\n");
        this.stream.writeString("FIREBUG INFO | App Version: " + info.appVersion + "\n");
        this.stream.writeString("FIREBUG INFO | App Platform: " + info.appPlatform + "\n");
        this.stream.writeString("FIREBUG INFO | App Build ID: " + info.appBuildID + "\n");
        this.stream.writeString("FIREBUG INFO | Locale: " + info.locale + "\n");
        this.stream.writeString("FIREBUG INFO | OS Name: " + info.osName + "\n");
        this.stream.writeString("FIREBUG INFO | OS Version: " + info.osVersion + "\n");
        this.stream.writeString("FIREBUG INFO | Export Date: " + this.startedTime.toGMTString() + "\n");
        this.stream.writeString("FIREBUG INFO | Test Suite: " + FBTestApp.TestConsole.testListPath + "\n");
        this.stream.writeString("FIREBUG INFO | Total Tests: " + tests.length + "\n");
        this.stream.writeString("\n");
    },

    onTestSuiteDone: function(canceled)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtrace.ProgressListener; onTestSuiteDone " + canceled);

        if (!this.stream)
            return;

        var passingTests = FBTestApp.TestSummary.passingTests;

        // Log summary
        this.stream.writeString("\n");
        this.stream.writeString("FIREBUG INFO | Test Suite Finished: " +
            (new Date()).toGMTString() + "\n");
        this.stream.writeString("FIREBUG INFO | Passing: " + passingTests.passing + "\n");
        this.stream.writeString("FIREBUG INFO | Failing: " + passingTests.failing + "\n");

        this.stream.close();
    },

    onTestStart: function(test)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtrace.ProgressListener; onTestStart: " + test.uri, test);

        if (!this.stream)
            return;

        var testName = test.testPage ? test.testPage : test.uri;

        // Log Start of the test.
        this.stream.writeString("FIREBUG INFO | " + testName +
            " | [START] " + test.desc + "\n");
    },

    onTestDone: function(test)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtrace.ProgressListener; onTestDone", test);

        if (!this.stream)
            return;

        var moniker = "TEST-PASS";
        if (test.error)
            moniker = (test.category == "fails") ? "TEST-KNOWN-FAIL" : "TEST-UNEXPECTED-FAIL";

        var testName = test.testPage ? test.testPage : test.uri;

        // Report test messages for failures.
        if (test.error)
        {
            for (var i=0; i<test.results.length; i++)
            {
                var result = test.results[i];
                this.stream.writeString("FIREBUG INFO | " + testName +
                    " | " + (result.pass ? "[OK]" : "[ERROR]") + " " + result.msg + "\n");
            }
        }

        // Log result of the test.
        this.stream.writeString("FIREBUG " + moniker + " | " + testName + " | [DONE]\n");
    }
};

// ********************************************************************************************* //
// Registration

return TestLogger;

// ********************************************************************************************* //
});
