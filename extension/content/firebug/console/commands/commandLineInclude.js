/* See license.txt for terms of usage */

define([
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
    "firebug/editor/editor",
],
function(FirebugReps, Domplate, Locale, Dom, Win, Css, Str, Options, Menu, System, Xpcom, Obj) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;
const removeConfirmation = "commandline.include.removeConfirmation";
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
const storeFilename = "includeAliases.json";

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

var CommandLineIncludeRep = domplate(FirebugReps.Table,
{
    tableClassName: "tableCommandLineInclude dataTable",

    tag:
        FirebugReps.OBJECTBOX({_repObject: "$object"},
            FirebugReps.Table.tag
        ),

    inspectable: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Handlers

    getValueTag: function(object)
    {
        if (object.cons === DomplateTag)
            return object;
        else
            return FirebugReps.Table.getValueTag(object);
    },

    getUrlTag: function(href, aliasName)
    {
        var urlTag =
            SPAN({style:"height:100%"},
                A({"href": href, "target": "_blank", "class": "url"},
                    Str.cropString(href, 100)
                ),
                SPAN({"class": "commands"}
                // xxxFlorent: temporarily disabled, see: 
                //    http://code.google.com/p/fbug/issues/detail?id=5878#c27
                /*,
                SPAN({
                    "class":"closeButton",
                    onclick: this.deleteAlias.bind(this, aliasName),
                })*/
                )
            );

        return urlTag;
    },

    displayAliases: function(context)
    {
        var store = CommandLineInclude.getStore();
        var keys = store.getKeys();
        var arrayToDisplay = [];
        var returnValue = Firebug.Console.getDefaultReturnValue();

        if (keys.length === 0)
        {
            var msg = Locale.$STR("commandline.include.noDefinedAlias");
            Firebug.Console.log(msg, context, null, FirebugReps.Hint);
            return returnValue;
        }

        for (var i=0; i<keys.length; i++)
        {
            var aliasName = keys[i];
            arrayToDisplay.push({
                "alias": SPAN({"class":"aliasName", "data-aliasname": aliasName}, aliasName),
                "URL": this.getUrlTag(store.getItem(aliasName), aliasName, context)
            });
        }

        var input = new CommandLineIncludeObject();
        this.log(arrayToDisplay, ["alias", "URL"], context, input);
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
        Firebug.Editor.startEditing(target, target.dataset.aliasname, editor);
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
        if (!tr)
            return [];

        var url = tr.querySelector("a.url").href;
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

var CommandLineInclude = Obj.extend(Firebug.Module,
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
            this.log("aliasCreated", [newAlias], [context, "info"]);
        }

        if (!hasWarnings)
            this.log("includeSuccess", [filename], [context, "info", true]);
    },

    onError: function(context, url, loadingMsgRow)
    {
        this.clearLoadingMessage(loadingMsgRow);
        this.log("loadFail", [url], [context, "error"]);
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
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("CommandLineInclude.getStore; can't open or create the store");
        }

        return this.store;
    },

    log: function(localeStr, localeArgs, logArgs, noAutoPrefix)
    {
        var prefixedLocaleStr = (noAutoPrefix ? localeStr : "commandline.include."+localeStr);

        var msg = Locale.$STRF(prefixedLocaleStr, localeArgs);
        logArgs.unshift([msg]);
        return Firebug.Console.logFormatted.apply(Firebug.Console, logArgs);
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
        var returnValue = Firebug.Console.getDefaultReturnValue();

        // checking arguments:
        if ((newAlias !== undefined && typeof newAlias !== "string") || newAlias === "")
        {
            this.log("invalidAliasArgumentType", [], [context, "error"]);
            return returnValue;
        }

        if (url !== null && typeof url !== "string" || !url && !newAlias)
        {
            this.log("invalidUrlArgumentType", [], [context, "error"]);
            return returnValue;
        }

        if (newAlias !== undefined)
            newAlias = newAlias.toLowerCase();

        if ((urlIsAlias && url.length > 30) || (newAlias && newAlias.length > 30))
        {
            this.log("tooLongAliasName", [newAlias || url], [context, "error"]);
            return returnValue;
        }

        if (newAlias !== undefined && reNotAlias.test(newAlias))
        {
            this.log("invalidAliasName", [newAlias], [context, "error"]);
            return returnValue;
        }

        if (urlIsAlias)
        {
            var store = this.getStore();
            var aliasName = url.toLowerCase();
            url = store.getItem(aliasName);
            if (url === undefined)
            {
                this.log("aliasNotFound", [aliasName], [context, "error"]);
                return returnValue;
            }
        }

        // if the URL is null, we delete the alias
        if (newAlias !== undefined && url === null)
        {
            var store = this.getStore();
            if (store.getItem(newAlias) === undefined)
            {
                this.log("aliasNotFound", [newAlias], [context, "error"]);
                return returnValue;
            }

            store.removeItem(newAlias);
            this.log("aliasRemoved", [newAlias], [context, "info"]);
            return returnValue;
        }
        var loadingMsgRow = this.log("Loading", [], [context, "loading", true], true);
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

        xhr.onload = function()
        {
            if (xhr.status !== 200)
                return errorFunction.apply(this, arguments);
            var codeToEval = xhr.responseText;
            var hasWarnings = false;

            // test if the content is an HTML file, which is the most current after a mistake
            if (!isValidJS(codeToEval))
            {
                CommandLineInclude.log("invalidSyntax", [], [context, "warn"]);
                CommandLineInclude.clearLoadingMessage(loadingMsgRow);
                hasWarnings = true;
            }

            // Do not print anything if  the inclusion succeeds.
            var successFunctionEval = function() { };
            // Let's use the default function to handle errors.
            var errorFunctionEval = null;

            Firebug.CommandLine.evaluateInGlobal(codeToEval, context, undefined, undefined,
                successFunctionEval, errorFunctionEval, undefined, {noCmdLineAPI: true});

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
                this.log("invalidRequestProtocol", [], [context, "error"]);
                return;
            }
            throw ex;
        }

        if (acceptedSchemes.indexOf(xhr.channel.URI.scheme) === -1)
        {
            this.log("invalidRequestProtocol", [], [context, "error"]);
            this.clearLoadingMessage(loadingMsgRow);
            return;
        }

        xhr.send(null);
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
    Firebug.InlineEditor.call(this, doc);
}

IncludeEditor.prototype = domplate(Firebug.InlineEditor.prototype,
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
    helpUrl: "http://getfirebug.com/wiki/index.php/include"
});

Firebug.registerRep(CommandLineIncludeRep);

Firebug.registerModule(CommandLineInclude);

return CommandLineInclude;

// ********************************************************************************************* //
}});
