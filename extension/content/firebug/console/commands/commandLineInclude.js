/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/options",
    "firebug/chrome/menu",
    "firebug/lib/system",
    "firebug/lib/xpcom",
    "firebug/lib/object",
    "firebug/chrome/tableRep",
    "firebug/console/console",
    "firebug/editor/editor",
    "firebug/editor/inlineEditor",
],
function(Module, Rep, FirebugReps, Domplate, Locale, Dom, Win, Css, Str, Options, Menu, System,
    Xpcom, Obj, TableRep, Console, Editor, InlineEditor) {

// ********************************************************************************************* //
// Constants

var {domplate, DomplateTag, SPAN, TR, P, LI, A, BUTTON} = Domplate;

const Ci = Components.interfaces;
const Cu = Components.utils;
const removeConfirmation = "commandline.include.removeConfirmation";
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
const storeFilename = "includeAliases.json";
var Trace = FBTrace.to("DBG_COMMANDLINE");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var ScratchpadManager;

try
{
    var scope = {};
    Cu.import("resource:///modules/devtools/scratchpad-manager.jsm", scope);
    ScratchpadManager = scope.ScratchpadManager;
}
catch(ex)
{
    // Scratchpad does not exists (when using Seamonkey ...)
}

var storageScope = {}, StorageService;
Cu.import("resource://firebug/storageService.js", storageScope);
StorageService = storageScope.StorageService;

var defaultAliases = {
    "jquery": "http://code.jquery.com/jquery-latest.js"
};

// ********************************************************************************************* //
// Implementation

var CommandLineIncludeRep = domplate(TableRep,
{
    tableClassName: "tableCommandLineInclude dataTable",

    tag:
        Rep.tags.OBJECTBOX({_repObject: "$object"},
            TableRep.tag
        ),

    inspectable: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Handlers

    getValueTag: function(object)
    {
        if (object.cons === DomplateTag)
            return object;
        else
            return TableRep.getValueTag(object);
    },

    getUrlTag: function(href, aliasName)
    {
        var urlTag =
            SPAN({style: "height: 100%"},
                A({"href": href, "target": "_blank", "class": "url"},
                    Str.cropString(href, 100)
                )
                /*,
                // xxxFlorent: temporarily disabled, see:
                //    http://code.google.com/p/fbug/issues/detail?id=5878#c27
                SPAN({"class": "commands"},
                SPAN({
                    "class":"closeButton",
                    onclick: this.deleteAlias.bind(this, aliasName),
                })
                )*/
            );

        return urlTag;
    },

    displayAliases: function(context)
    {
        var store = CommandLineInclude.getStore();
        var keys = store.getKeys();
        var arrayToDisplay = [];
        var returnValue = Console.getDefaultReturnValue();

        if (keys.length === 0)
        {
            var msg = Locale.$STR("commandline.include.noDefinedAlias");
            Console.log(msg, context, null, FirebugReps.Hint);
            return returnValue;
        }

        for (var i=0; i<keys.length; i++)
        {
            var aliasName = keys[i];
            arrayToDisplay.push({
                alias: SPAN({"class": "aliasName", "data-aliasname": aliasName}, aliasName),
                URL: this.getUrlTag(store.getItem(aliasName), aliasName, context)
            });
        }

        var columns = [
            {
                property: "alias",
                label: Locale.$STR("commandline.include.Alias")
            },
            {
                property: "URL",
                label: Locale.$STR("commandline.include.URL")
            }
        ];

        var input = new CommandLineIncludeObject();
        var row = this.log(arrayToDisplay, columns, context, input);

        // Add rep object for the context menu options
        row.repObject = input;

        return returnValue;
    },

    deleteAlias: function(aliasName, ev)
    {
        // NOTE: that piece of code has not been tested since deleting aliases through the table
        // has been disabled.
        // Once it is enabled again, make sure FBTests is available for this feature
        var store = CommandLineInclude.getStore();
        if (!Options.get(removeConfirmation))
        {
            var check = {value: false};
            var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_YES +
            prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_NO;

            if (prompts.confirmEx(context.chrome.window, Locale.$STR("Firebug"),
                Locale.$STR("commandline.include.confirmDelete"), flags, "", "", "",
                Locale.$STR("Do_not_show_this_message_again"), check) > 0)
            {
                return;
            }

            // Update 'Remove Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Options.set(removeConfirmation, !check.value);
        }
        store.removeItem(aliasName);
    },

    startEditing: function(target)
    {
        var editor = this.getEditor(target.ownerDocument);
        Editor.startEditing(target, target.dataset.aliasname, editor);
    },

    editAliasName: function(tr)
    {
        var target = tr.querySelector(".aliasName");
        this.startEditing(target);
    },

    editAliasURL: function(tr)
    {
        var target = tr.querySelector(".url");
        this.startEditing(target);
    },

    openInScratchpad: function(url)
    {
        var spWin = ScratchpadManager.openScratchpad();
        var scriptContent = null;
        var editor = null;

        spWin.onload = function()
        {
            var spInstance = spWin.Scratchpad;
            //intro = spInstance.strings.GetStringFromName("scratchpadIntro");
            spInstance.addObserver(
            {
                onReady: function()
                {
                    editor = spInstance.editor;

                    // if the content of the script is loaded, we write the content in the editor
                    // otherwise, we write a text that asks the user to wait
                    if (scriptContent)
                        editor.setText(scriptContent);
                    else
                        editor.setText("// "+Locale.$STR("scratchpad.loading"));
                }
            });
        };

        var xhr = new XMLHttpRequest({mozAnon: true});
        xhr.open("GET", url, true);

        xhr.onload = function()
        {
            if (spWin.closed)
                return;

            scriptContent = xhr.responseText;

            // if the editor is ready, we put the content on it now
            // otherwise, we wait for the editor
            if (editor)
                editor.setText(scriptContent);
        };

        xhr.onerror = function()
        {
            if (spWin.closed)
                return;

            spInstance.setText("// "+Locale.$STR("scratchpad.failLoading"));
        };

        xhr.send(null);
    },

    supportsObject: function(object, type)
    {
        return object instanceof CommandLineIncludeObject;
    },

    getContextMenuItems: function(object, target, context)
    {
        var tr = Dom.getAncestorByTagName(target, "tr");
        var link = tr && tr.querySelector("a.url");
        if (!link)
            return [];

        var url = link.href;
        var aliasName = tr.querySelector(".aliasName").dataset.aliasname;
        var context = Firebug.currentContext;
        var items = [
            {
                label: "CopyLocation",
                id: "fbCopyLocation",
                tooltiptext: "clipboard.tip.Copy_Location",
                command: Obj.bindFixed(System.copyToClipboard, System, url)
            },
            // xxxFlorent: temporarily disabled, see:
            //    http://code.google.com/p/fbug/issues/detail?id=5878#c27
            /*"-",
            {
                label: "commandline.label.EditAliasName",
                id: "fbEditAliasName",
                tooltiptext: "commandline.tip.Edit_Alias_Name",
                command: this.editAliasName.bind(this, tr)
            },
            {
                label: "commandline.label.EditAliasURL",
                id: "fbEditAliasUrl",
                tooltiptext: "commandline.tip.Edit_Alias_URL",
                command: this.editAliasURL.bind(this, tr)
            },
            {
                label: "commandline.label.DeleteAlias",
                id: "fbDeleteAlias",
                tooltiptext: "commandline.tip.Delete_Alias",
                command: this.deleteAlias.bind(this, aliasName, ev)
            },*/
            "-",
            {
                label: Locale.$STRF("commandline.label.IncludeScript", [aliasName]),
                id: "fbInclude",
                tooltiptext: "commandline.tip.Include_Script",
                command: Obj.bindFixed(CommandLineInclude.include, CommandLineInclude,
                    context, aliasName)
            },
            "-",
            {
                label: "OpenInTab",
                id: "fbOpenInTab",
                tooltiptext: "firebug.tip.Open_In_Tab",
                command: Obj.bindFixed(Win.openNewTab, Win, url)
            }
        ];

        if (ScratchpadManager)
        {
            items.push({
                label: "commandline.label.OpenInScratchpad",
                id: "fbOpenInScratchpad",
                tooltiptext: "commandline.tip.Open_In_Scratchpad",
                command: this.openInScratchpad.bind(this, url)
            });
        }

        return items;
    },

    getEditor: function(doc)
    {
        if (!this.editor)
            this.editor = new IncludeEditor(doc);
        return this.editor;
    }
});

// ********************************************************************************************* //

function CommandLineIncludeObject()
{
}

// ********************************************************************************************* //

var CommandLineInclude = Obj.extend(Module,
{
    onSuccess: function(newAlias, context, loadingMsgRow, xhr, hasWarnings)
    {
        var urlComponent = xhr.channel.URI.QueryInterface(Ci.nsIURL);
        var filename = urlComponent.fileName, url = urlComponent.spec;
        // clear the message saying "loading..."
        this.clearLoadingMessage(loadingMsgRow);

        if (newAlias)
        {
            var store = this.getStore();
            store.setItem(newAlias, url);
            this._log("aliasCreated", [newAlias], [context, "info"]);
        }

        if (!hasWarnings)
            this._log("includeSuccess", [filename], [context, "info", true]);
    },

    onError: function(context, url, loadingMsgRow)
    {
        this.clearLoadingMessage(loadingMsgRow);
        this._log("loadFail", [url], [context, "error"]);
    },

    clearLoadingMessage: function(loadingMsgRow)
    {
        if (loadingMsgRow && loadingMsgRow.parentNode)
            loadingMsgRow.parentNode.removeChild(loadingMsgRow);
    },

    getStore: function()
    {
        if (!this.store)
        {
            var isNewStore = !StorageService.hasStorage(storeFilename);
            // Pass also the parent window to the new storage. The window will be
            // used to figure out whether the browser is running in private mode.
            // If yes, no data will be persisted.
            this.store = StorageService.getStorage(storeFilename,
                Firebug.chrome.window);

            // If the file did not exist, we put in there the default aliases.
            if (isNewStore)
            {
                for (var alias in defaultAliases)
                    this.store.setItem(alias, defaultAliases[alias]);
            }
        }

        // Let's log when the store could not be opened.
        if (!this.store)
        {
            Trace.sysout("CommandLineInclude.getStore; can't open or create the store");
        }

        return this.store;
    },

    // xxxFlorent: Prefix with underscore until we fix Issue 6806
    // since we're listening to Firebug.Console events.
    _log: function(localeStr, localeArgs, logArgs, noAutoPrefix)
    {
        var prefixedLocaleStr = (noAutoPrefix ? localeStr : "commandline.include." + localeStr);
        var msg = Locale.$STRF(prefixedLocaleStr, localeArgs);
        logArgs.unshift([msg]);
        return Console.logFormatted.apply(Console, logArgs);
    },

    /**
     * Includes a remote script.
     * Executed by the include() command.
     *
     * @param {Context} context The Firebug context.
     * @param {string} url The location of the script.
     * @param {string} [newAlias] The alias to define for the script.
     */
    include: function(context, url, newAlias)
    {
        var reNotAlias = /[\.\/]/;
        var urlIsAlias = url !== null && !reNotAlias.test(url);
        var returnValue = Console.getDefaultReturnValue();

        // checking arguments:
        if ((newAlias !== undefined && typeof newAlias !== "string") || newAlias === "")
        {
            this._log("invalidAliasArgumentType", [], [context, "error"]);
            return returnValue;
        }

        if (url !== null && typeof url !== "string" || !url && !newAlias)
        {
            this._log("invalidUrlArgumentType", [], [context, "error"]);
            return returnValue;
        }

        if (newAlias !== undefined)
            newAlias = newAlias.toLowerCase();

        if ((urlIsAlias && url.length > 30) || (newAlias && newAlias.length > 30))
        {
            this._log("tooLongAliasName", [newAlias || url], [context, "error"]);
            return returnValue;
        }

        if (newAlias !== undefined && reNotAlias.test(newAlias))
        {
            this._log("invalidAliasName", [newAlias], [context, "error"]);
            return returnValue;
        }

        if (urlIsAlias)
        {
            var store = this.getStore();
            var aliasName = url.toLowerCase();
            url = store.getItem(aliasName);
            if (url === undefined)
            {
                this._log("aliasNotFound", [aliasName], [context, "error"]);
                return returnValue;
            }
        }

        // if the URL is null, we delete the alias
        if (newAlias !== undefined && url === null)
        {
            var store = this.getStore();
            if (store.getItem(newAlias) === undefined)
            {
                this._log("aliasNotFound", [newAlias], [context, "error"]);
                return returnValue;
            }

            store.removeItem(newAlias);
            this._log("aliasRemoved", [newAlias], [context, "info"]);
            return returnValue;
        }
        var loadingMsgRow = this._log("Loading", [], [context, "loading", true], true);
        var onSuccess = this.onSuccess.bind(this, newAlias, context, loadingMsgRow);
        var onError = Obj.bindFixed(this.onError, this, context, url, loadingMsgRow);
        this.evaluateRemoteScript(url, context, onSuccess, onError, loadingMsgRow);

        return returnValue;
    },

    /**
     * Evaluates a remote script. Prints a warning message in the console in case of syntax error.
     *
     * @param {string} url The URL.
     * @param {Context} context The Firebug context.
     * @param {function} [successFunction] The callback if the script has been successfully run.
     * @param {function} [errorFunction] The callback if the expression has been run with errors.
     * @param {*} [loadingMsgRow] The row in the console printed while the script is loading and
     *      that has to be cleared.
     */
    evaluateRemoteScript: function(url, context, successFunction, errorFunction, loadingMsgRow)
    {
        var xhr = new XMLHttpRequest({ mozAnon: true, timeout:30});
        var acceptedSchemes = ["http", "https"];
        var absoluteURL = context.browser.currentURI.resolve(url);

        Trace.sysout("CommandLineInclude.evaluateRemoteScript; absoluteURL = " + absoluteURL);

        xhr.onload = function()
        {
            if (xhr.status !== 200)
                return errorFunction.apply(this, arguments);
            var codeToEval = xhr.responseText;
            var hasWarnings = false;

            // test if the content is an HTML file, which is the most current after a mistake
            if (!isValidJS(codeToEval))
            {
                CommandLineInclude._log("invalidSyntax", [], [context, "warn"]);
                CommandLineInclude.clearLoadingMessage(loadingMsgRow);
                hasWarnings = true;
            }

            // Do not print anything if the inclusion succeeds.
            var successFunctionEval = function() { };
            // Let's use the default function to handle errors.
            var errorFunctionEval = null;

            // xxxFlorent: Using evaluateInGlobal doesn't allow to stop execution in the script
            //             panel. Just use it when having CSP until we migrate to JSD2.
            //             (see Issue 6551)
            if (CommandLineInclude.isCSPDoc(context))
            {
                Trace.sysout("CommandLineInclude.evaluateRemoteScript; "+
                    "document is using CSP. use evaluateInGlobal");
                Firebug.CommandLine.evaluateInGlobal(codeToEval, context, undefined, undefined,
                    successFunctionEval, errorFunctionEval, undefined, {noCmdLineAPI: true});
            }
            else
            {
                Firebug.CommandLine.evaluateInWebPage(codeToEval, context);
            }

            if (successFunction)
                successFunction(xhr, hasWarnings);
        };

        if (errorFunction)
        {
            xhr.ontimeout = xhr.onerror = errorFunction;
        }

        try
        {
            xhr.open("GET", absoluteURL, true);
        }
        catch(ex)
        {
            this.clearLoadingMessage(loadingMsgRow);
            if (ex.name === "NS_ERROR_UNKNOWN_PROTOCOL")
            {
                this._log("invalidRequestProtocol", [], [context, "error"]);
                return;
            }
            throw ex;
        }

        if (acceptedSchemes.indexOf(xhr.channel.URI.scheme) === -1)
        {
            this._log("invalidRequestProtocol", [], [context, "error"]);
            this.clearLoadingMessage(loadingMsgRow);
            return;
        }

        xhr.send(null);
    },

    /**
     * Hack; Should only be used inside CommandLineInclude.
     * Test whether the current global is under CSP.
     *
     * @param {Context} context
     *
     * @return boolean
     */
    isCSPDoc: function(context)
    {
        // Create a random variable name:
        var varName = "_" + Math.ceil(Math.random() * 1000000);
        var codeToEval = "window['" + varName + "']" + " = true;";

        var global = context.getCurrentGlobal();

        context.includePatternToBlock = codeToEval;
        Firebug.CommandLine.evaluateInWebPage(codeToEval, context);
        var ret = global.wrappedJSObject[varName] !== true;

        if (ret)
            delete global.wrappedJSObject[varName];

        return ret;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  //
    // Module events:

    resetAllOptions: function()
    {
        if (StorageService.hasStorage(storeFilename))
        {
            StorageService.removeStorage(storeFilename);
            this.store = null;
        }
    },

    /**
     * Hack; Should only be used inside CommandLineInclude.
     * Intercept the display of a warning if related to the use of isCSPDoc().
     *
     * Event triggered by Console.logRow().
     */
    onLogRowCreated: function(panel, row, context)
    {
        if (row && row.className.indexOf("warningMessage") !== -1 &&
            context.includePatternToBlock &&
            row.textContent.indexOf(context.includePatternToBlock) !== -1)
        {
            row.parentNode.removeChild(row);
            context.includePatternToBlock = "";
        }
    }
});

// ********************************************************************************************* //
// Command Handler

function onCommand(context, args)
{
    if (args.length === 0)
        return CommandLineIncludeRep.displayAliases(context);

    var self = CommandLineInclude;
    Array.unshift(args, context);
    return CommandLineInclude.include.apply(self, args);
}

// ********************************************************************************************* //
// Local Helpers

function IncludeEditor(doc)
{
    InlineEditor.call(this, doc);
}

IncludeEditor.prototype = domplate(InlineEditor.prototype,
{
    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        var context = Firebug.currentContext;
        if (Css.hasClass(target, "aliasName"))
            this.updateAliasName(target, value, context);
        else if (Css.hasClass(target, "url"))
            this.updateURL(target, value, context);
    },

    updateURL: function(target, value, context)
    {
        var tr = Dom.getAncestorByTagName(target, "tr");
        var aliasName = tr.querySelector(".aliasName").textContent;
        CommandLineInclude.include(context, value, aliasName, {"onlyUpdate":true});
        target.textContent = value;
    },

    updateAliasName: function(target, value, context)
    {
        var oldAliasName = target.textContent;
        var store = CommandLineInclude.getStore();
        var url = store.getItem(oldAliasName);
        store.removeItem(oldAliasName);
        store.setItem(value, url);
        target.dataset.aliasname = value;
        target.textContent = value;
    }
});

function isValidJS(codeToCheck)
{
    try
    {
        new Function(codeToCheck);
        return true;
    }
    catch(ex)
    {
        if (ex instanceof SyntaxError)
            return false;
        else
            throw ex;
    }
};

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("include", {
    handler: onCommand,
    description: Locale.$STR("console.cmd.help.include"),
    helpUrl: "https://getfirebug.com/wiki/index.php/include"
});

Firebug.registerRep(CommandLineIncludeRep);

Firebug.registerModule(CommandLineInclude);
Console.addListener(CommandLineInclude);

return CommandLineInclude;

// ********************************************************************************************* //
});
