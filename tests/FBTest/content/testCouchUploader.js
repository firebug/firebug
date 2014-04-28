/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string",
    "firebug/lib/object",
    "firebug/chrome/window",
],
function(FBTrace, Str, Obj, Win) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //

/** @namespace */
FBTestApp.TestCouchUploader =
{
    onUpload: function()
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.TestCouchUploader.onUpload;");

        var total = this.getTotalTests();
        if (!total)
        {
            // xxxHonza: localization
            alert("There are no test results to upload!");
            return;
        }

        // Get header document...
        var header = this.getHeaderDoc();
        var params = this.getUserMessage();
        if (params.cancel)
            return;

        // Crop the message (1K max)
        header["User Message"] = Str.cropString(params.message, 1024);

        // Since Gecko 2.0 installed extensions must be collected asynchronously
        var self = this;
        this.getExtensions(function(extensions)
        {
            header["Extensions"] = extensions;

            // ...and store it into the DB to get ID.
            var options =
            {
                success: function(headerResp)
                {
                    self.onHeaderUploaded(headerResp, header);
                },
                error: function(status, error, reason)
                {
                    if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
                    {
                        FBTrace.sysout("fbtest.TestCouchUploader.onUpload; ERROR Can't upload " +
                            "test results" + status + ", " + error + ", " + reason);
                    }

                    alert("Can't upload test results! " + error + ", " + reason);
                }
            };
            CouchDB.saveDoc(header, options);
        });
    },

    onHeaderUploaded: function(headerResp, header)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.TestCouchUploader.onUploaonHeaderUploaded; " +
                "Header uploaded OK", headerResp);

        // Collect all results.
        var self = this;
        var results = {docs: []};
        FBTestApp.TestConsole.iterateTests(function(group, test)
        {
            // The test must be launched at least once.
            if (test.start)
            {
                var resultDoc = self.getResultDoc(test);
                resultDoc.headerid = headerResp.id;
                resultDoc["Export Date"] = header["Export Date"];
                results.docs.push(resultDoc);
            }
        });

        // Store all results into the DB
        /** @ignore */
        var options =
        {
            success: function(resultsResp)
            {
                self.onResultsUploaded(headerResp.id, resultsResp);
            },
            error: function(status, error, reason)
            {
                if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("fbtest.TestCouchUploader.onUpload; ERROR Can't upload " +
                        "test results" + status + ", " + error + ", " + reason);
                }

                alert("Can't upload test results!");
            }
        };
        CouchDB.bulkSave(results, options);
    },

    onResultsUploaded: function(headerid, data)
    {
        var remoteFBL = FBTestApp.FBTest.FirebugWindow.FBL;

        var uri = Firebug.getPref("extensions.fbtest", "databaseURL");
        var name = Firebug.getPref("extensions.fbtest", "databaseName");

        remoteFBL.openNewTab("https://getfirebug.com/testresults/" +
            "?dburi=" + uri +
            "&dbname=" + name +
            "&userheaderid=" + headerid);
    },

    onStatusBarPopupShowing: function(event)
    {
        // Can't upload if there are no results.
        Firebug.chrome.$("menu_uploadTestResults").disabled = !this.isEnabled();
    },

    isEnabled: function()
    {
        return this.getTotalTests() > 0;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getHeaderDoc: function()
    {
        var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
        var currLocale = Firebug.getPref("general.useragent", "locale");
        var systemInfo = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag);

        var header = {type: "user-header"};
        header["App Build ID"] = appInfo.appBuildID;
        //header["App Changeset"] =
        header["App Name"] = appInfo.name;
        header["App Platform"] = appInfo.platformVersion;
        header["App Version"] = appInfo.version;
        //header["CPU Architecture"] =
        header["Export Date"] = (new Date()).toGMTString();
        header["FBTest"] = FBTestApp.TestConsole.getVersion();
        header["Firebug"] = Firebug.getVersion();
        header["Locale"] = currLocale;
        header["OS Detailed Name"] = this.getOSName(systemInfo.getProperty("name"),
            systemInfo.getProperty("version"));
        header["OS Platform"] = systemInfo.getProperty("name");
        header["OS Version"] = systemInfo.getProperty("version");
        header["OS Architecture"] = systemInfo.getProperty("arch");
        header["Test Suite"] = FBTestApp.TestConsole.testListPath;
        header["Total Tests"] = this.getTotalTests().toString();

        return header;
    },

    getOSName: function(name, version)
    {
        switch (name)
        {
            case "Windows_NT":
                // According to
                // http://msdn.microsoft.com/en-us/library/windows/desktop/ms724832%28v=vs.85%29.aspx
                var versions = new Map();
                versions.set("5.0", "2000");
                versions.set("5.1", "XP");
                versions.set("5.2", "XP 64-bit");
                versions.set("6.0", "Vista");
                versions.set("6.1", "7");
                versions.set("6.2", "8");
                versions.set("6.3", "8.1");

                if (versions.has(version))
                    return "Windows " + versions.get(version);
                break;

            case "Darwin":
                // According to http://en.wikipedia.org/wiki/Darwin_%28operating_system%29
                var versions = new Map();
                versions.set("1.3.1", "10.0");
                versions.set("1.4.1", "10.1");
                versions.set("5.1", "10.1.1");
                versions.set("5.5", "10.1.5");
                versions.set("6.0.1", "10.2");
                versions.set("6.8", "10.2.8");
                versions.set("7.0", "10.3");
                versions.set("7.9", "10.3.9");
                versions.set("8.0", "10.4");
                versions.set("8.11", "10.4.11");
                versions.set("9.0", "10.5");
                versions.set("9.8", "10.5.8");
                versions.set("10.0", "10.6");
                versions.set("10.8", "10.4");
                versions.set("11.0.0", "10.7");
                versions.set("11.4.0", "10.7.4");
                versions.set("11.4.2", "10.7.5");
                versions.set("12.0.0", "10.8");
                versions.set("12.3.0", "10.8.2");
                versions.set("12.4.0", "10.8.4");
                versions.set("12.5.0", "10.8.5");
                versions.set("13.0.0", "10.9");

                if (versions.has(version))
                    return "Mac OS X " + versions.get(version);
                break;

            case "Linux":
                // Check for Fedora
                var reFedora = /fc(\d+)/;
                var match = version.match(reFedora);
                if (match)
                  return "Fedora " + match[1];
                break;

                // Check for Ubuntu
                var reGnome = /^(3\.\d+).*-generic$/;

                var match = version.match(reGnome);
                if (match)
                {
                    // According to http://en.wikipedia.org/wiki/List_of_Ubuntu_releases#Table_of_versions
                    var versions = new Map();
                    versions.set("3.0", "11.10");
                    versions.set("3.2", "12.04 LTS");
                    versions.set("3.5", "12.10/12.04.2 LTS");
                    versions.set("3.8", "13.04/12.04.3 LTS");
                    versions.set("3.11", "13.10/12.04.4 LTS");
                    versions.set("3.13", "14.04 LTS");
                    versions.set("3.14", "12.04.5 LTS");

                    if (versions.has(version))
                        return "Ubuntu " + versions.get(version);
                }
        }

        return "";
    },

    getUserMessage: function()
    {
        var params = {
            message: "",
            cancel: false,
        };

        var dialog = parent.openDialog("chrome://fbtest/content/userMessage.xul",
            "_blank", "chrome,centerscreen,resizable=yes,modal=yes",
            params);

        return params;
    },

    getExtensions: function(callback)
    {
        try
        {
            var application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.extIApplication);

            function collectExtensions(extensions)
            {
                // Put together a list of installed extensions.
                var result = [];
                for (var i=0; i<extensions.all.length; i++)
                {
                    var ext = extensions.all[i];
                    result.push({
                        name: ext.name,
                        id: ext.id,
                        enabled: ext.enabled
                    });
                }
                callback(result);
            }

            if (application.extensions)
            {
                collectExtensions(application.extensions);
            }
            else if (application.getExtensions)
            {
                application.getExtensions(function(extensions)
                {
                    collectExtensions(extensions);
                });
            }
            else
            {
                callback([]);
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("testCouchUploader.getExtensions; EXCEPTION " + e, e);

            callback([]);
        }
    },

    getResultDoc: function(test)
    {
        var result = Obj.extend(this.getHeaderDoc(), {type: "user-result"});

        result.description = test.desc;
        result.test = test.uri;
        result.file = test.testPage ? test.testPage : test.uri;
        result.result = test.error ? (test.category == "fails" ? "TEST-KNOWN-FAIL" :
            "TEST-UNEXPECTED-FAIL") : "TEST-PASS";

        if (test.error)
        {
            var progress = "";
            for (var resultIdx in test.results)
            {
                var testResult = test.results[resultIdx];
                progress += (testResult.pass ? "[OK]" : "[ERROR]") + " " + testResult.msg + "\n";
            }
            result.progress = progress;
        }

        return result;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getTotalTests: function()
    {
        var total = 0;
        FBTestApp.TestConsole.iterateTests(function(group, test)
        {
            // The test must be launched at least once.
            if (test.start)
                total++;
        });
        return total;
    }
};

// ********************************************************************************************* //

/** @namespace */
var CouchDB =
{
    saveDoc: function(doc, options)
    {
        var uri = Firebug.getPref("extensions.fbtest", "databaseURL");
        var name = Firebug.getPref("extensions.fbtest", "databaseName");

        options = options || {};
        this.ajax({
            type: "POST",
            url: uri + name,
            contentType: "application/json",
            data: toJSON(doc),
            complete: function(req)
            {
                if (FBTrace.DBG_FBTEST)
                    FBTrace.sysout("testCouchUploader.saveDoc;", req);

                var resp = parseJSON(req.responseText);
                if (req.status == 201)
                {
                    doc._id = resp.id;
                    doc._rev = resp.rev;
                    if (options.success)
                        options.success(resp);
                }
                else if (options.error)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("testCouchUploader.saveDoc; ERROR " + options.error, req);

                    options.error(req.status, (resp ? resp.error : "unknown"),
                        (resp ? resp.reason : "unknown"));
                }
                else
                {
                    alert("The document could not be saved: " +
                        (resp ? resp.reason : "unknown"));
                }
            }
        });
    },

    bulkSave: function(docs, options)
    {
        var uri = Firebug.getPref("extensions.fbtest", "databaseURL");
        var name = Firebug.getPref("extensions.fbtest", "databaseName");

        Obj.extend(options, {successStatus: 201});

        this.ajax({
            type: "POST",
            url: uri + name + "/_bulk_docs",
            contentType: "application/json",
            data: toJSON(docs),
            complete: function(req)
            {
                if (FBTrace.DBG_FBTEST)
                    FBTrace.sysout("testCouchUploader.bulkSave;", req);

                var resp = parseJSON(req.responseText);
                if (req.status == 201)
                {
                    if (options.success)
                        options.success(resp);
                }
                else if (options.error)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("testCouchUploader.bulkSave; ERROR " + options.error, req);

                    options.error(req.status, (resp ? resp.error : "unknown"),
                        (resp ? resp.reason : "unknown"));
                }
                else
                {
                    alert("The document could not be saved: " +
                        (resp ? resp.reason : "unknown"));
                }
            },
        });
    },

    ajax: function(options)
    {
        try
        {
            var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
                createInstance(Ci.nsIXMLHttpRequest);

            request.open(options.type, options.url, true);
            request.setRequestHeader("Content-Type", options.contentType);
            /** @ignore */
            request.onreadystatechange = function()
            {
                if (request.readyState === 4)
                {
                    if (options.complete)
                        options.complete(request);
                }
            };
            request.send(options.data);
        }
        catch (e)
        {
            if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
                FBTrace.sysout("fbtest.TestCouchUploader; ajax EXCEPTION " + e, e);
        }
    }
};

// ********************************************************************************************* //

function toJSON(obj)
{
    return obj !== null ? JSON.stringify(obj) : null;
}

function parseJSON(data)
{
    try
    {
        return JSON.parse(data);
    }
    catch (e)
    {
        FBTrace.sysout("testCouchUploader.parseJSON; EXCEPTION " + e, e);
        FBTrace.sysout("testCouchUploader.parseJSON; Data ", data);
    }
}

// ********************************************************************************************* //
// Registration

return FBTestApp.TestCouchUploader;

// ********************************************************************************************* //
});
