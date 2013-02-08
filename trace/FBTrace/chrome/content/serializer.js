/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/http",
    "fbtrace/lib/options",
    "fbtrace/importedMessage",
    "fbtrace/messageTemplate",
],
function(FBTrace, Http, Options, ImportedMessage, MessageTemplate) {

// ********************************************************************************************* //
// Constants 

const Cc = Components.classes;
const Ci = Components.interfaces;

const reEndings = /\r\n|\r|\n/;

// ********************************************************************************************* //
// Serializer Implementation

var Serializer =
{
    onSaveToFile: function(console)
    {
        try
        {
            var nsIFilePicker = Ci.nsIFilePicker;
            var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
            fp.init(window, null, nsIFilePicker.modeSave);
            fp.appendFilter("Firebug Tracing Logs","*.ftl;");
            fp.appendFilters(nsIFilePicker.filterAll);
            fp.filterIndex = 1;
            fp.defaultString = "firebug-tracing-logs.ftl";

            var rv = fp.show();
            if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            {
                var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
                    .createInstance(Ci.nsIFileOutputStream);
                foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

                var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
                var currLocale = Options.getPref("general.useragent", "locale");
                var systemInfo = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag);

                var log = { version: "1.0" };

                // Firebug info version
                var version = this.getFirebugVersion();
                if (version)
                    log.firebug = version;

                log.app = {
                    name: appInfo.name,
                    version: appInfo.version,
                    platformVersion: appInfo.platformVersion,
                    buildID: appInfo.appBuildID,
                    locale: currLocale
                };
                log.os = {
                    name: systemInfo.getProperty("name"),
                    version: systemInfo.getProperty("version")
                };
                log.date = (new Date()).toGMTString();
                log.messages = [];

                // Iterate over all logs and store it into a file.
                var tbody = console.logs.firstChild;
                for (var row = tbody.firstChild; row; row = row.nextSibling)
                    this.saveMessage(log, row.repObject);

                var jsonString = JSON.stringify(log, null, "  ");
                foStream.write(jsonString, jsonString.length);
                foStream.close();
            }
        }
        catch (err)
        {
            FBTrace.sysout("FBTrace; onSaveToFile EXCEPTION " + err, err);
        }
    },

    getFirebugVersion: function()
    {
        try
        {
            var jsonString = Options.getPref("extensions", "bootstrappedAddons");
            var value = JSON.parse(jsonString);
            var firebugInfo = value["firebug@software.joehewitt.com"];
            return firebugInfo ? firebugInfo.version : null;
        }
        catch (err)
        {
            FBTrace.sysout("FBTrace; getFirebugVersion EXCEPTION " + err, err);
        }
    },

    onLoadFromFile: function(console)
    {
        try
        {
            var nsIFilePicker = Ci.nsIFilePicker;
            var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
            fp.init(window, null, nsIFilePicker.modeOpen);
            fp.appendFilters(nsIFilePicker.filterAll);
            fp.appendFilter("Firebug Tracing Logs", "*.ftl;");
            fp.filterIndex = 1;

            var rv = fp.show();
            if (rv != nsIFilePicker.returnOK)
                return;

            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            inputStream.init(fp.file, -1, -1, 0); // read-only

            // Read and parset the content
            var jsonString = Http.readFromStream(inputStream)
            var log = JSON.parse(jsonString);
            if (!log)
            {
                FBTrace.sysout("FBTrace; No log data available.");
                return;
            }

            log.filePath = fp.file.path;

            // Create header, dump all logs and create footer.
            MessageTemplate.dumpSeparator(console, MessageTemplate.importHeaderTag, log);
            for (var i=0; i<log.messages.length; i++)
            {
                var logMsg = log.messages[i];
                if (!logMsg.type)
                    continue;
                else if (logMsg.type == "separator")
                    MessageTemplate.dumpSeparator(console);
                else
                    MessageTemplate.dump(new ImportedMessage(logMsg), console);
            }
            MessageTemplate.dumpSeparator(console, MessageTemplate.importFooterTag);
        }
        catch (err)
        {
            FBTrace.sysout("FBTrace; onLoadFromFile EXCEPTION " + err, err);
        }
    },

    saveMessage: function(log, message)
    {
        if (!message)
            return;

        var text = message.text;
        text = text ? text.replace(reEndings, "") : "---";
        text = text.replace(/"|'/g, "");

        var msgLog = {
            index: message.index,
            text: message.text,
            type: message.type ? message.type : "",
            time: message.time,
            stack: []
        };

        var stack = message.stack;
        for (var i=0; stack && i<stack.length; i++)
        {
            var frame = stack[i];
            msgLog.stack.push({
                fileName: frame.fileName,
                lineNumber: frame.lineNumber,
                funcName: frame.funcName,
            });
        }

        log.messages.push(msgLog);
    }
}

// ********************************************************************************************* //

return Serializer;

// ********************************************************************************************* //
});
