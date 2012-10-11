/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //
// Constants

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://firebug/fbtrace.js");
Cu.import("resource://firebug/loader.js");

// Make sure PrefLoader variable doesn't leak into the global scope.
var prefLoaderScope = {};
Cu.import("resource://firebug/prefLoader.js", prefLoaderScope);
var PrefLoader = prefLoaderScope.PrefLoader;

const firstRunPage = "https://getfirebug.com/firstrun#Firebug ";

var Locale = Cu.import("resource://firebug/locale.js").Locale;

// ********************************************************************************************* //
// String Bundles

// Register bundle yet before any Locale.$STR* API is used.
Locale.registerStringBundle("chrome://firebug/locale/firebug.properties");

// xxxHonza: this needs to be done befor firebug/cookies modules are loaded
// and it should be part of the cookies directory.
Locale.registerStringBundle("chrome://firebug/locale/cookies.properties");

// ********************************************************************************************* //
// Overlay Helpers

function $(id)
{
    return document.getElementById(id);
}

function $$(selector)
{
    return document.querySelectorAll(selector);
}

function $el(name, attributes, children, parent)
{
    attributes = attributes || {};

    if (!Array.isArray(children) && !parent)
    {
        parent = children;
        children = null;
    }

    // localize
    if (attributes.label)
        attributes.label = Locale.$STR(attributes.label);

    if (attributes.tooltiptext)
        attributes.tooltiptext = Locale.$STR(attributes.tooltiptext);

    // persist
    if (attributes.persist)
        updatePersistedValues(attributes);

    var el = document.createElement(name);
    for (var a in attributes)
        el.setAttribute(a, attributes[a]);

    for each (var a in children)
        el.appendChild(a);

    if (parent)
    {
        if (attributes.position)
            parent.insertBefore(el, parent.children[attributes.position - 1]);
        else
            parent.appendChild(el);

        // Mark to remove when Firebug is uninstalled.
        el.setAttribute("firebugRootNode", true);
    }

    return el;
}

function $command(id, oncommand, arg)
{
    // Wrap the command within a startFirebug call. If Firebug isn't yet loaded
    // this will force it to load.
    oncommand = "Firebug.GlobalUI.startFirebug(function(){" + oncommand + "})";
    if (arg)
        oncommand = "void function(arg){" + oncommand + "}(" + arg + ")";

    return $el("command", {
        id: id,
        oncommand: oncommand
    }, $("mainCommandSet"))
}

function $key(id, key, modifiers, command, position)
{
    var attributes = 
    {
        id: id,
        modifiers: modifiers,
        command: command,
        position: position
    };

    attributes[KeyEvent["DOM_"+key] ? "keycode" : "key"] = key;

    return $el("key", attributes, $("mainKeyset"));
}

function $menupopup(attributes, children, parent)
{
    return $el("menupopup", attributes, children, parent);
}

function $menu(attrs, children)
{
    return $el("menu", attrs, children);
}

function $menuseparator(attrs)
{
    return $el("menuseparator", attrs);
}

function $menuitem(attrs)
{
    return $el("menuitem", attrs);
}

function $splitmenu(attrs, children)
{
    return $el("splitmenu", attrs, children);
}

function $menupopupOverlay(parent, children)
{
    if (!parent)
        return;

    for (var i=0; i<children.length; ++i)
    {
        var child = children[i];
        var beforeEl;

        if (child.getAttribute("position"))
        {
            var pos = child.getAttribute("position");
            beforeEl = parent.children[pos - 1];
        }
        else if (child.getAttribute("insertbefore"))
        {
            var ids = child.getAttribute("insertbefore").split(",");
            for (var j=0; j < ids.length; ++j)
            {
                beforeEl = parent.querySelector("#" + ids[j]);
                if (beforeEl)
                    break;
            }
        }
        else if (child.getAttribute("insertafter"))
        {
            var ids = child.getAttribute("insertafter").split(",");
            for (var j=0; j < ids.length; ++j)
            {
                beforeEl = parent.querySelector("#" + ids[j]);
                if (beforeEl)
                    break;
            }
            if (beforeEl)
                beforeEl = beforeEl.nextSibling;
        }

        if (beforeEl)
            parent.insertBefore(child, beforeEl);
        else
            parent.appendChild(child);

        // Mark the inserted node to remove it when Firebug is uninstalled.
        child.setAttribute("firebugRootNode", true);
    }
}

function $toolbarButton(id, attrs, children, defaultPos)
{
    attrs["class"] = "toolbarbutton-1";
    attrs.firebugRootNode = true;
    attrs.id = id;

    // in seamonkey gNavToolbox is null onload
    var button = $el("toolbarbutton", attrs, children, (gNavToolbox || $("navigator-toolbox")).palette);

    var selector = "[currentset^='" + id + ",'],[currentset*='," + id + ",'],[currentset$='," + id + "']";
    var toolbar = document.querySelector(selector);
    if (!toolbar)
        return; // todo defaultPos

    var currentset = toolbar.getAttribute("currentset").split(",");
    var i = currentset.indexOf(id) + 1;

    var len = currentset.length, beforeEl;
    while (i < len && !(beforeEl = $(currentset[i])))
        i++;

    return toolbar.insertItem(id, beforeEl);
}

function $tooltip(attrs, children)
{
    return $el("tooltip", attrs, children);
}

function $label(attrs)
{
    return $el("label", attrs);
}

// ********************************************************************************************* //
// Other Helpers

function updatePersistedValues(options)
{
    var persist = options.persist.split(",");
    var id = options.id;
    var RDF = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);
    var store = PlacesUIUtils.localStore; //this.RDF.GetDataSource("rdf:local-store");
    var root = RDF.GetResource("chrome://browser/content/browser.xul#" + id);

    var getPersist = function getPersist(aProperty)
    {
        var property = RDF.GetResource(aProperty);
        var target = store.GetTarget(root, property, true);

        if (target instanceof Ci.nsIRDFLiteral)
            return target.Value;
    }

    for each(var attr in persist)
    {
        var val = getPersist(attr);
        if (val)
            options[attr] = val;
    }
}

function cloneArray(arr)
{
    var newArr = [];
    for (var i=0; i<arr.length; i++)
        newArr.push(arr[i]);
    return newArr;
}

// ********************************************************************************************* //

Firebug.GlobalUI =
{
    nodesToRemove: [],

    $: $,
    $$: $$,
    $el: $el,
    $menupopupOverlay: $menupopupOverlay,
    $menuitem: $menuitem,
    $menuseparator: $menuseparator,
    $command: $command,
    $key: $key,
    $splitmenu: $splitmenu,
    $tooltip: $tooltip,
    $label: $label,

    $stylesheet: function(href)
    {
        var s = document.createProcessingInstruction("xml-stylesheet", 'href="' + href + '"');
        document.insertBefore(s, document.documentElement);
        this.nodesToRemove.push(s);
    },

    $script: function(src)
    {
        var script = document.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
        script.src = src;
        script.type = "text/javascript";
        script.setAttribute("firebugRootNode", true);
        document.documentElement.appendChild(script);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * This method is called by the Fremework to load entire Firebug. It's executed when
     * the user requires Firebug for the first time.
     *
     * @param {Object} callback Executed when Firebug is fully loaded
     */
    startFirebug: function(callback)
    {
        if (Firebug.waitingForFirstLoad)
            return;

        if (Firebug.isInitialized)
            return callback && callback(Firebug);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("overlay; Load Firebug...", (callback ? callback.toString() : ""));

        Firebug.waitingForFirstLoad = true;

        var container = $("appcontent");

        // List of Firebug scripts that must be loaded into the global scope (browser.xul)
        var scriptSources = [
            "chrome://firebug/content/trace.js",
            "chrome://firebug/content/legacy.js",
            "chrome://firebug/content/moduleConfig.js"
        ]

        // Create script elements.
        scriptSources.forEach(this.$script);

        // Create Firebug splitter element.
        $el("splitter", {id: "fbContentSplitter", collapsed: "true"}, container);

        // Create Firebug main frame and container.
        $el("vbox", {id: "fbMainFrame", collapsed: "true", persist: "height,width"}, [
            $el("browser", {
                id: "fbMainContainer",
                flex: "2",
                src: "chrome://firebug/content/firefox/firebugFrame.xul",
                disablehistory: "true"
            })
        ], container);

        // When Firebug is fully loaded and initialized it fires a "FirebugLoaded"
        // event to the browser document (browser.xul scope). Wait for that to happen.
        document.addEventListener("FirebugLoaded", function onLoad()
        {
            document.removeEventListener("FirebugLoaded", onLoad, false);
            Firebug.waitingForFirstLoad = false;

            // xxxHonza: TODO find a better place for notifying extensions
            FirebugLoader.dispatchToScopes("firebugFrameLoad", [Firebug]);
            callback && callback(Firebug);
        }, false);
    },

    onOptionsShowing: function(popup)
    {
        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                var option = child.getAttribute("option");
                if (option)
                {
                    var checked = PrefLoader.getPref(option);

                    // xxxHonza: I belive that allPagesActivation could be simple boolean option.
                    if (option == "allPagesActivation")
                        checked = (checked == "on") ? true : false;

                    child.setAttribute("checked", checked);
                }
            }
        }
    },

    onToggleOption: function(menuItem)
    {
        var option = menuItem.getAttribute("option");
        var checked = menuItem.getAttribute("checked") == "true";

        PrefLoader.setPref(option, checked);
    },

    onMenuShowing: function(popup, event)
    {
        // If the event comes from a sub menu, just ignore it.
        if (popup != event.target)
            return;

        while (popup.lastChild)
            popup.removeChild(popup.lastChild);

        // Generate dynamic content.
        for (var i=0; i<firebugMenuContent.length; i++)
            popup.appendChild(firebugMenuContent[i].cloneNode(true));

        var collapsed = "true";
        if (Firebug.chrome)
        {
            var fbContentBox = Firebug.chrome.$("fbContentBox");
            collapsed = fbContentBox.getAttribute("collapsed");
        }

        var currPos = PrefLoader.getPref("framePosition");
        var placement = Firebug.getPlacement ? Firebug.getPlacement() : "";

        // Switch between "Open Firebug" and "Hide Firebug" label in the popup menu.
        var toggleFirebug = popup.querySelector("#menu_firebug_toggleFirebug");
        if (toggleFirebug)
        {
            var hiddenUI = (collapsed == "true" || placement == "minimized");
            toggleFirebug.setAttribute("label", (hiddenUI ?
                Locale.$STR("firebug.ShowFirebug") : Locale.$STR("firebug.HideFirebug")));

            toggleFirebug.setAttribute("tooltiptext", (hiddenUI ?
                Locale.$STR("firebug.menu.tip.Open_Firebug") :
                Locale.$STR("firebug.menu.tip.Minimize_Firebug")));

            var currentLocation = toggleFirebug.ownerDocument.defaultView.top.location.href;
            var inDetachedWindow = currentLocation.indexOf("firebug.xul") > 0;

            // If Firebug is detached, use "Focus Firebug Window" label
            // instead of "Hide Firebug" when the menu isn't opened from
            // within the detached Firebug window. the 'placement' is used
            // to ensure Firebug isn't closed with close button of detached window
            // and 'inDetachedWindow' variable is also used to ensure the menu is
            // opened from within the detached window.
            if (currPos == "detached" && Firebug.currentContext &&
                placement != "minimized" && !inDetachedWindow)
            {
                toggleFirebug.setAttribute("label", Locale.$STR("firebug.FocusFirebug"));
                toggleFirebug.setAttribute("tooltiptext",
                    Locale.$STR("firebug.menu.tip.Focus_Firebug"));
            }
        }

        // Hide "Deactivate Firebug" menu if Firebug is not active.
        var closeFirebug = popup.querySelector("#menu_firebug_closeFirebug");
        if (closeFirebug)
        {
            closeFirebug.setAttribute("collapsed", (Firebug.currentContext ? "false" : "true"));
        }

        // Update About Menu
        var version = Firebug.GlobalUI.getVersion();
        if (version)
        {
            var node = popup.getElementsByClassName("firebugAbout")[0];
            var aboutLabel = node.getAttribute("label");
            node.setAttribute("label", aboutLabel + " " + version);
            node.classList.remove("firebugAbout");
        }

        // Allow Firebug menu customization (see FBTest and FBTrace as an example).
        var event = new CustomEvent("firebugMenuShowing", {detail: popup});
        document.dispatchEvent(event);
    },

    onMenuHiding: function(popup, event)
    {
        if (popup != event.target)
            return;

        // xxxHonza: I don't know why the timeout must be here, but if it isn't
        // the icon menu is broken (see issue 5427)
        setTimeout(function()
        {
            while (popup.lastChild)
                popup.removeChild(popup.lastChild);
        });
    },

    onPositionPopupShowing: function(popup)
    {
        while (popup.lastChild)
            popup.removeChild(popup.lastChild);

        // Load Firebug before the position is changed.
        var oncommand = "Firebug.GlobalUI.startFirebug(function(){" +
            "Firebug.chrome.setPosition('%pos%')" + "})";

        var items = [];
        var currPos = PrefLoader.getPref("framePosition");
        for each (var pos in ["detached", "top", "bottom", "left", "right"])
        {
            var label = pos.charAt(0).toUpperCase() + pos.slice(1);
            var item = $menuitem({
                label: Locale.$STR("firebug.menu." + label),
                tooltiptext: Locale.$STR("firebug.menu.tip." + label),
                type: "radio",
                oncommand: oncommand.replace("%pos%", pos),
                checked: (currPos == pos)
            });

            if (pos == "detached")
                items.key = "key_firebug_detachFirebug";

            popup.appendChild(item);
        }

        return true;
    },

    openAboutDialog: function()
    {
        // Firefox 4.0+
        Components.utils["import"]("resource://gre/modules/AddonManager.jsm");
        AddonManager.getAddonByID("firebug@software.joehewitt.com", function(addon)
        {
            openDialog("chrome://mozapps/content/extensions/about.xul", "",
                "chrome,centerscreen,modal", addon);
        });
    },

    setPosition: function(newPosition)
    {
        // todo
    },

    getVersion: function()
    {
        var versionURL = "chrome://firebug/content/branch.properties";
        var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

        var channel = ioService.newChannel(versionURL, null, null);
        var input = channel.open();
        var sis = Cc["@mozilla.org/scriptableinputstream;1"].
            createInstance(Ci.nsIScriptableInputStream);
        sis.init(input);

        var content = sis.readBytes(input.available());
        sis.close();

        var m = /RELEASE=(.*)/.exec(content);
        if (m)
            var release = m[1];
        else
            return "no RELEASE in " + versionURL;

        m = /VERSION=(.*)/.exec(content);
        if (m)
            var version = m[1];
        else
            return "no VERSION in " + versionURL;

        return version+""+release;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // External Editors

    onEditorsShowing: function(popup)
    {
        Firebug.GlobalUI.startFirebug(function()
        {
            Firebug.ExternalEditors.onEditorsShowing(popup);
        });

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Page Context Menu Overlay

    loadContextMenuOverlay: function(win)
    {
        if (typeof(win.nsContextMenu) == "undefined")
            return;

        // https://bugzilla.mozilla.org/show_bug.cgi?id=433168
        var setTargetOriginal = this.setTargetOriginal = win.nsContextMenu.prototype.setTarget;
        win.nsContextMenu.prototype.setTarget = function(aNode, aRangeParent, aRangeOffset)
        {
            setTargetOriginal.apply(this, arguments);

            if (this.isTargetAFormControl(aNode))
                this.shouldDisplay = true;
        };

        // Hide built-in inspector if the pref says so.
        var initItemsOriginal = this.initItemsOriginal = win.nsContextMenu.prototype.initItems;
        win.nsContextMenu.prototype.initItems = function()
        {
            initItemsOriginal.apply(this, arguments);

            // Hide built-in inspector menu item if the pref "extensions.firebug.hideDefaultInspector"
            // says so. Note that there is also built-in preference "devtools.inspector.enable" that
            // can be used for the same purpose.
            var hideInspect = PrefLoader.getPref("hideDefaultInspector");
            if (hideInspect)
            {
                this.showItem("inspect-separator", false);
                this.showItem("context-inspect", false);
            }
        }
    },

    unloadContextMenuOverlay: function(win)
    {
        if (typeof(win.nsContextMenu) == "undefined")
            return;

        win.nsContextMenu.prototype.setTarget = this.setTargetOriginal;
        win.nsContextMenu.prototype.initItems = this.initItemsOriginal;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // First Run Page

    loadFirstRunPage: function(win, reason)
    {
        if (checkFirebugVersion(PrefLoader.getPref("currentVersion")) <= 0)
            return;

        // Do not show the first run page when Firebug is being updated. It'll be displayed
        // the next time the browser is restarted
        // # ADDON_UPGRADE == 7
        if (reason == 7)
            return;

        // Open the page in the top most window, so the user can see it immediately.
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
        if (wm.getMostRecentWindow("navigator:browser") == win.top)
        {
            // Update the preference to make sure the page is not displayed again.
            // To avoid being annoying when Firefox crashes, forcibly save it, too.
            var version = Firebug.GlobalUI.getVersion();
            PrefLoader.setPref("currentVersion", version);

            if (PrefLoader.getPref("showFirstRunPage"))
            {
                var timeout = setTimeout(function()
                {
                    if (window.closed)
                        return;

                    Firebug.GlobalUI.openFirstRunPage();
                }, 1000);

                window.addEventListener("unload", function()
                {
                    clearTimeout(timeout);
                }, false);
            }
        }
    },

    openFirstRunPage: function()
    {
        var version = Firebug.GlobalUI.getVersion();
        url = firstRunPage + version;

        // Open the firstRunPage in background
        /*gBrowser.selectedTab = */gBrowser.addTab(url, null, null, null);

        // Make sure prefs are stored, otherwise the firstRunPage would be displayed
        // again if Firefox crashes.
        setTimeout(function()
        {
            PrefLoader.forceSave();
        }, 400);
    },
}

// ********************************************************************************************* //
// Global Firebug CSS

Firebug.GlobalUI.$stylesheet("chrome://firebug/content/firefox/browserOverlay.css");

// ********************************************************************************************* //
// Broadcasters

/**
 * This element (a broadcaster) is storing Firebug state information. Other elements
 * (like for example the Firebug start button) can watch it and display the info to
 * the user.
 */
$el("broadcaster", {id: "firebugStatus", suspended: true}, $("mainBroadcasterSet"));

// ********************************************************************************************* //
// Global Commands

$command("cmd_firebug_closeFirebug", "Firebug.closeFirebug(true);");
$command("cmd_firebug_toggleInspecting", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.Inspector.toggleInspecting(Firebug.currentContext);");
$command("cmd_firebug_focusCommandLine", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.CommandLine.focus(Firebug.currentContext);");
$command("cmd_firebug_toggleFirebug", "Firebug.toggleBar();");
$command("cmd_firebug_detachFirebug", "Firebug.toggleDetachBar(false, true);");
$command("cmd_firebug_inspect", "Firebug.Inspector.inspectFromContextMenu(arg);", "document.popupNode");
$command("cmd_firebug_toggleBreakOn", "if (Firebug.currentContext) Firebug.chrome.breakOnNext(Firebug.currentContext, event);");
$command("cmd_firebug_toggleDetachFirebug", "Firebug.toggleDetachBar(false, true);");
$command("cmd_firebug_increaseTextSize", "Firebug.Options.changeTextSize(1);");
$command("cmd_firebug_decreaseTextSize", "Firebug.Options.changeTextSize(-1);");
$command("cmd_firebug_normalTextSize", "Firebug.Options.setTextSize(0);");
$command("cmd_firebug_focusFirebugSearch", "if (Firebug.currentContext) Firebug.Search.onSearchCommand(document);");
$command("cmd_firebug_customizeFBKeys", "Firebug.ShortcutsModel.customizeShortcuts();");
$command("cmd_firebug_enablePanels", "Firebug.PanelActivation.enableAllPanels();");
$command("cmd_firebug_disablePanels", "Firebug.PanelActivation.disableAllPanels();");
$command("cmd_firebug_clearActivationList", "Firebug.PanelActivation.clearAnnotations();");
$command("cmd_firebug_clearConsole", "Firebug.Console.clear(Firebug.currentContext);");
$command("cmd_firebug_allOn", "Firebug.PanelActivation.toggleAll('on');");
$command("cmd_firebug_toggleOrient", "Firebug.chrome.toggleOrient();");
$command("cmd_firebug_resetAllOptions", "Firebug.resetAllOptions(true);");
$command("cmd_firebug_toggleProfiling", ""); //todo

$command("cmd_firebug_openInEditor", "Firebug.ExternalEditors.onContextMenuCommand(event)");

// ********************************************************************************************* //
// Global Shortcuts

(function(globalShortcuts)
{
    var keyset = $("mainKeyset");

    globalShortcuts.forEach(function(id)
    {
        var shortcut = PrefLoader.getPref("key.shortcut." + id);
        var tokens = shortcut.split(" ");
        var key = tokens.pop();

        var keyProps = {
            id: "key_firebug_" + id,
            modifiers: tokens.join(","),
            command: "cmd_firebug_" + id,
            position: 1
        };

        if (key.length <= 1)
            keyProps.key = key;
        else if (KeyEvent["DOM_"+key])
            keyProps.keycode = key;

        $el("key", keyProps, keyset);
    });

    keyset.parentNode.insertBefore(keyset, keyset.nextSibling);
})(["toggleFirebug", "toggleInspecting", "focusCommandLine",
    "detachFirebug", "closeFirebug", "toggleBreakOn"]);


/* Used by the global menu, but should be really global shortcuts?
key_increaseTextSize
key_decreaseTextSize
key_normalTextSize
key_help
key_toggleProfiling
key_focusFirebugSearch
key_customizeFBKeys
*/

// ********************************************************************************************* //
// Firebug Start Button Popup Menu

$menupopupOverlay($("mainPopupSet"), [
    $menupopup(
    {
        id: "fbStatusContextMenu",
        onpopupshowing: "Firebug.GlobalUI.onOptionsShowing(this)"
    },
    [
        $menu(
        {
            label: "firebug.uiLocation",
            tooltiptext: "firebug.menu.tip.UI_Location",
            "class": "fbInternational"
        },
        [
            $menupopup({onpopupshowing: "Firebug.GlobalUI.onPositionPopupShowing(this)"})
        ]),
        $menuseparator(),
        $menuitem({
            id: "menu_firebug_ClearConsole",
            label: "firebug.ClearConsole",
            tooltiptext: "firebug.ClearTooltip",
            command: "cmd_firebug_clearConsole",
            key: "key_firebug_clearConsole"
        }),
        $menuitem({
            id: "menu_firebug_showErrorCount",
            type: "checkbox",
            label: "firebug.Show_Error_Count",
            tooltiptext: "firebug.menu.tip.Show_Error_Count",
            oncommand: "Firebug.GlobalUI.onToggleOption(this)",
            option: "showErrorCount"
        }),
        $menuseparator(),
        $menuitem({
            id: "menu_firebug_enablePanels",
            label: "firebug.menu.Enable_All_Panels",
            tooltiptext: "firebug.menu.tip.Enable_All_Panels",
            command: "cmd_firebug_enablePanels"
        }),
        $menuitem({
            id: "menu_firebug_disablePanels",
            label: "firebug.menu.Disable_All_Panels",
            tooltiptext: "firebug.menu.tip.Disable_All_Panels",
            command: "cmd_firebug_disablePanels"
        }),
        $menuseparator(),
        $menuitem({
            id: "menu_firebug_AllOn",
            type: "checkbox",
            label: "On_for_all_web_pages",
            tooltiptext: "firebug.menu.tip.On_for_all_Web_Sites",
            command: "cmd_firebug_allOn",
            option: "allPagesActivation"
        }),
        $menuitem({
            id: "menu_firebug_clearActivationList",
            label: "firebug.menu.Clear_Activation_List",
            tooltiptext: "firebug.menu.tip.Clear_Activation_List",
            command: "cmd_firebug_clearActivationList"
        })
    ])
])

// ********************************************************************************************* //
// Firebug Global Menu

/**
 * There are more instances of Firebug Menu (e.g. one in Firefox -> Tools -> Web Developer
 * and one in Firefox 4 (top-left orange button menu) -> Web Developer
 *
 * If extensions want to override the menu thay need to iterate all existing instance
 * using document.querySelectorAll(".fbFirebugMenuPopup") and append new menu items to all
 * of them. Iteration must be done in the global space (browser.xul)
 *
 * The same menu is also used for Firebug Icon Menu (Firebug's toolbar). This menu is cloned
 * and initialized as soon as Firebug UI is actually loaded. Since it's cloned from the original
 * (global scope) extensions don't have to extend it (possible new menu items are already there).
 */
var firebugMenuContent = [

    // Open/close Firebug
    $menuitem(
    {
        id: "menu_firebug_toggleFirebug",
        label: "firebug.ShowFirebug",
        tooltiptext: "firebug.menu.tip.Open_Firebug",
        command: "cmd_firebug_toggleFirebug",
        key: "key_firebug_toggleFirebug",
        "class": "fbInternational"
    }),
    $menuitem(
    {
        id: "menu_firebug_closeFirebug",
        label: "firebug.Deactivate_Firebug",
        tooltiptext: "firebug.tip.Deactivate_Firebug",
        command: "cmd_firebug_closeFirebug",
        key: "key_firebug_closeFirebug",
        "class": "fbInternational"
    }),

    // Firebug UI position
    $menu(
    {
        label: "firebug.uiLocation",
        tooltiptext: "firebug.menu.tip.UI_Location",
        "class": "fbInternational"
    },
    [
        $menupopup({onpopupshowing: "Firebug.GlobalUI.onPositionPopupShowing(this)"})
    ]),

    $menuseparator(),

    // External Editors
    $menu(
    {
        id: "FirebugMenu_OpenWith",
        label:"firebug.OpenWith",
        tooltiptext:"firebug.menu.tip.Open_With",
        "class": "fbInternational",
        insertafter: "menu_firebug_openActionsSeparator",
        openFromContext: "true",
        command: "cmd_firebug_openInEditor"
    },
    [
        $menupopup({id:"fbFirebugMenu_OpenWith",
            onpopupshowing: "return Firebug.GlobalUI.onEditorsShowing(this);"})
    ]),

    // Text Size
    $menu(
    {
        id: "FirebugMenu_TextSize",
        label: "firebug.TextSize",
        tooltiptext: "firebug.menu.tip.Text_Size",
        "class": "fbInternational"
    },
    [
        $menupopup({},
        [
            $menuitem(
            {
                id: "menu_firebug_increaseTextSize",
                label: "firebug.IncreaseTextSize",
                tooltiptext: "firebug.menu.tip.Increase_Text_Size",
                command: "cmd_firebug_increaseTextSize",
                key: "key_firebug_increaseTextSize",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_decreaseTextSize",
                label: "firebug.DecreaseTextSize",
                tooltiptext: "firebug.menu.tip.Decrease_Text_Size",
                command: "cmd_firebug_decreaseTextSize",
                key: "key_firebug_decreaseTextSize",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_normalTextSize",
                label: "firebug.NormalTextSize",
                tooltiptext: "firebug.menu.tip.Normal_Text_Size",
                command: "cmd_firebug_normalTextSize",
                key: "key_firebug_normalTextSize",
                "class": "fbInternational"
            }),
        ])
    ]),

    // Options
    $menu(
    {
        id: "FirebugMenu_Options",
        label: "firebug.Options",
        tooltiptext: "firebug.menu.tip.Options",
        "class": "fbInternational"
    },
    [
        $menupopup(
        {
            id: "FirebugMenu_OptionsPopup",
            onpopupshowing: "return Firebug.GlobalUI.onOptionsShowing(this);"
        },
        [
            $menuitem(
            {
                id: "menu_firebug_toggleShowErrorCount",
                type: "checkbox",
                label: "firebug.Show_Error_Count",
                tooltiptext: "firebug.menu.tip.Show_Error_Count",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "showErrorCount",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_showTooltips",
                type: "checkbox",
                label: "firebug.menu.Show_Info_Tips",
                tooltiptext: "firebug.menu.tip.Show_Info_Tips",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "showInfoTips",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_shadeBoxModel",
                type: "checkbox",
                label: "ShadeBoxModel",
                tooltiptext: "inspect.option.tip.Shade_Box_Model",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "shadeBoxModel",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_showQuickInfoBox",
                type: "checkbox",
                label: "ShowQuickInfoBox",
                tooltiptext: "inspect.option.tip.Show_Quick_Info_Box",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "showQuickInfoBox",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_enableA11y",
                type: "checkbox",
                label: "firebug.menu.Enable_Accessibility_Enhancements",
                tooltiptext: "firebug.menu.tip.Enable_Accessibility_Enhancements",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "a11y.enable",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_activateSameOrigin",
                type: "checkbox",
                label: "firebug.menu.Activate_Same_Origin_URLs2",
                tooltiptext: "firebug.menu.tip.Activate_Same_Origin_URLs",
                oncommand: "Firebug.GlobalUI.onToggleOption(this)",
                option: "activateSameOrigin",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_toggleOrient",
                type: "checkbox",
                label: "firebug.menu.Vertical_Panels",
                tooltiptext: "firebug.menu.tip.Vertical_Panels",
                command: "cmd_firebug_toggleOrient",
                option: "viewPanelOrient",
                "class": "fbInternational"
            }),
            $menuseparator({id: "menu_firebug_optionsSeparator"}),
            $menuitem(
            {
                id: "menu_firebug_resetAllOptions",
                label: "firebug.menu.Reset_All_Firebug_Options",
                tooltiptext: "firebug.menu.tip.Reset_All_Firebug_Options",
                command: "cmd_firebug_resetAllOptions",
                "class": "fbInternational"
            }),
        ])
    ]),

    $menuseparator({id: "FirebugBetweenOptionsAndSites", collapsed: "true"}),

    // Sites
    $menu(
    {
        id: "FirebugMenu_Sites",
        label: "firebug.menu.Firebug_Online",
        tooltiptext: "firebug.menu.tip.Firebug_Online",
        "class": "fbInternational"
    },
    [
        $menupopup({},
        [
            $menuitem(
            {
                id: "menu_firebug_firebugUrlWebsite",
                label: "firebug.Website",
                tooltiptext: "firebug.menu.tip.Website",
                oncommand: "Firebug.chrome.visitWebsite('main')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugUrlExtensions",
                label: "firebug.menu.Extensions",
                tooltiptext: "firebug.menu.tip.Extensions",
                oncommand: "Firebug.chrome.visitWebsite('extensions')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugHelp",
                label: "firebug.help",
                tooltiptext: "firebug.menu.tip.help",
                command: "cmd_firebug_openHelp",
                key: "key_firebug_help",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugDoc",
                label: "firebug.Documentation",
                tooltiptext: "firebug.menu.tip.Documentation",
                oncommand: "Firebug.chrome.visitWebsite('docs')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugKeyboard",
                label: "firebug.KeyShortcuts",
                tooltiptext: "firebug.menu.tip.Key_Shortcuts",
                oncommand: "Firebug.chrome.visitWebsite('keyboard')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugForums",
                label: "firebug.Forums",
                tooltiptext: "firebug.menu.tip.Forums",
                oncommand: "Firebug.chrome.visitWebsite('discuss')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugIssues",
                label: "firebug.Issues",
                tooltiptext: "firebug.menu.tip.Issues",
                oncommand: "Firebug.chrome.visitWebsite('issues')",
                "class": "fbInternational"
            }),
            $menuitem(
            {
                id: "menu_firebug_firebugDonate",
                label: "firebug.Donate",
                tooltiptext: "firebug.menu.tip.Donate",
                oncommand: "Firebug.chrome.visitWebsite('donate')",
                "class": "fbInternational"
            }),
        ])
    ]),

    $menuseparator({id: "menu_firebug_miscActionsSeparator", collapsed: "true"}),

    $menuseparator({id: "menu_firebug_toolsSeparator", collapsed: "true"}),

    $menuitem(
    {
        id: "menu_firebug_customizeShortcuts",
        label: "firebug.menu.Customize_shortcuts",
        tooltiptext: "firebug.menu.tip.Customize_Shortcuts",
        command: "cmd_firebug_customizeFBKeys",
        key: "key_firebug_customizeFBKeys",
        "class": "fbInternational"
    }),

    $menuseparator({id: "menu_firebug_aboutSeparator"}),

    $menuitem({
        id: "menu_firebug_about",
        label: "firebug.About",
        tooltiptext: "firebug.menu.tip.About",
        oncommand: "Firebug.GlobalUI.openAboutDialog()",
        "class": "firebugAbout fbInternational"
    }),
];

// ********************************************************************************************* //
// Global Menu Overlays

// Firefox page context menu
$menupopupOverlay($("contentAreaContextMenu"), [
    $menuseparator(),
    $menuitem({
        id: "menu_firebug_firebugInspect",
        label: "firebug.InspectElementWithFirebug",
        command: "cmd_firebug_inspect",
        "class": "menuitem-iconic fbInternational"
    })
]);

// Firefox view menu
$menupopupOverlay($("menu_viewPopup"), [
    $menuitem({
        id: "menu_firebug_viewToggleFirebug",
        insertbefore: "toggle_taskbar",
        label: "firebug.Firebug",
        type: "checkbox",
        key: "key_firebug_toggleFirebug",
        command: "cmd_firebug_toggleFirebug",
        "class": "fbInternational"
    })
]);

// SeaMonkey view menu
$menupopupOverlay($("menu_View_Popup"), [
    $menuitem({
        id: "menu_firebug_viewToggleFirebug",
        insertafter: "menuitem_fullScreen",
        label: "firebug.Firebug",
        type: "checkbox",
        key: "key_firebug_toggleFirebug",
        command: "cmd_firebug_toggleFirebug",
        "class": "menuitem-iconic fbInternational"
    })
]);

// Firefox Tools -> Web Developer Menu
$menupopupOverlay($("menuWebDeveloperPopup"), [
    $menu({
        id: "menu_webDeveloper_firebug",
        position: 1,
        label: "firebug.Firebug",
        "class": "menu-iconic fbInternational"
    }, [
        $menupopup({
            id: "menu_firebug_firebugMenuPopup",
            "class": "fbFirebugMenuPopup",
            onpopupshowing: "return Firebug.GlobalUI.onMenuShowing(this, event);",
            onpopuphiding: "return Firebug.GlobalUI.onMenuHiding(this, event);"
        })
    ]),
    $menuseparator({
        insertafter: "menu_webDeveloper_firebug"
    })
]);

// Firefox Button -> Web Developer Menu
$menupopupOverlay($("appmenu_webDeveloper_popup"), [
    $splitmenu({
        id: "appmenu_firebug",
        position: 1,
        command: "cmd_firebug_toggleFirebug",
        key: "key_firebug_toggleFirebug",
        label: "firebug.Firebug",
        iconic: "true",
        "class": "fbInternational"
    }, [
        $menupopup({
            id: "appmenu_firebugMenuPopup",
            "class": "fbFirebugMenuPopup",
            onpopupshowing: "return Firebug.GlobalUI.onMenuShowing(this, event);",
            onpopuphiding: "return Firebug.GlobalUI.onMenuHiding(this, event);"
        })
    ]),
    $menuseparator({
        insertafter: "appmenu_firebug"
    })
]);

// Sea Monkey Tools Menu
$menupopupOverlay($("toolsPopup"), [
    $menu({
        id: "menu_firebug",
        insertbefore: "appmenu_webConsole",
        command: "cmd_firebug_toggleFirebug",
        key: "key_firebug_toggleFirebug",
        label: "firebug.Firebug",
        "class": "menuitem-iconic fbInternational"
    }, [
        $menupopup({
            id: "toolsmenu_firebugMenuPopup",
            "class": "fbFirebugMenuPopup",
            onpopupshowing: "return Firebug.GlobalUI.onMenuShowing(this, event);",
            onpopupshowing: "return Firebug.GlobalUI.onMenuHiding(this, event);"
        })
    ])
]);

// ********************************************************************************************* //
// Firefox Toolbar Buttons

$toolbarButton("firebug-inspectorButton", {
    label: "firebug.Inspect",
    tooltiptext: "firebug.InspectElement",
    observes: "cmd_firebug_toggleInspecting",
    style: "list-style-image: url(chrome://firebug/skin/inspect.png);" +
        "-moz-image-region: rect(0, 16px, 16px, 0);"
});

// Start Button Tooltip. As soon as Firebug is fully loaded, the tooltip content will be
// generated by firebug/firefox/start-button/startButtonOverlay module.
$menupopupOverlay($("mainPopupSet"), [
    $tooltip({
        "class": "firebugButtonTooltip",
        id: "firebug-buttonTooltip",
        orient: "vertical",
    }, [
        $label({
            "class": "version",
            "value": "Firebug " + Firebug.GlobalUI.getVersion()
        }),
        $label({
            "class": "status",
            "value": Locale.$STR("startbutton.tip.deactivated")
        })
    ])
]);

// TODO: why contextmenu doesn't work without cloning
$toolbarButton("firebug-button", {
    label: "firebug.Firebug",
    tooltip: "firebug-buttonTooltip",
    type: "menu-button",
    command: "cmd_firebug_toggleFirebug",
    contextmenu: "fbStatusContextMenu",
    observes: "firebugStatus",
    style: "list-style-image: url(chrome://firebug/skin/firebug16.png)"
}, [$("fbStatusContextMenu").cloneNode(true)]);

// Appends Firebug start button into Firefox toolbar automatically after installation.
// The button is appended only once - if the user removes it, it isn't appended again.
// TODO: merge into $toolbarButton?
// toolbarpalette check is for seamonkey, where it is in the document
if ((!$("firebug-button") || $("firebug-button").parentNode.tagName == "toolbarpalette")
    && !PrefLoader.getPref("toolbarCustomizationDone"))
{
    PrefLoader.setPref("toolbarCustomizationDone", true);

    // Get the current navigation bar button set (a string of button IDs) and append
    // ID of the Firebug start button into it.
    var startButtonId = "firebug-button";
    var navBarId = "nav-bar";
    var navBar = $(navBarId);
    var currentSet = navBar.currentSet;

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("Startbutton; curSet (before modification): " + currentSet);

    // Append only if the button is not already there.
    var curSet = currentSet.split(",");
    if (curSet.indexOf(startButtonId) == -1)
    {
        navBar.insertItem(startButtonId);
        navBar.setAttribute("currentset", navBar.currentSet);
        navBar.ownerDocument.persist("nav-bar", "currentset");

        // Check whether insertItem really works
        var curSet = navBar.currentSet.split(",");
        if (curSet.indexOf(startButtonId) == -1)
            FBTrace.sysout("Startbutton; navBar.insertItem doesn't work", curSet);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Startbutton; curSet (after modification): " + navBar.currentSet);

        try
        {
            // The current global scope is browser.xul.
            BrowserToolboxCustomizeDone(true);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("startButton; appendToToolbar EXCEPTION " + e, e);
        }
    }

    // Don't forget to show the navigation bar - just in case it's hidden.
    navBar.removeAttribute("collapsed");
    document.persist(navBarId, "collapsed");
}

// ********************************************************************************************* //
// Localization

// Internationalize all elements with 'fbInternational' class. Clone before internationalizing.
var elements = cloneArray(document.getElementsByClassName("fbInternational"));
Locale.internationalizeElements(document, elements, ["label", "tooltiptext", "aria-label"]);

// ********************************************************************************************* //
// Version Checker

function checkFirebugVersion(currentVersion)
{
    if (!currentVersion)
        return 1;

    var version = Firebug.GlobalUI.getVersion();

    // Use Firefox comparator service.
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].
        getService(Ci.nsIVersionComparator);
    return versionChecker.compare(version, currentVersion);
}

// ********************************************************************************************* //
// All Pages Activation" is on

// Load Firebug by default if activation is on for all pages (see issue 5522)
if (PrefLoader.getPref("allPagesActivation") == "on" || !PrefLoader.getPref("delayLoad"))
{
    Firebug.GlobalUI.startFirebug(function()
    {
        var browser = Firebug.Firefox.getBrowserForWindow(this);
        var uri = Firebug.Firefox.getCurrentURI();

        // Open Firebug UI (e.g. if the annotations say so, issue 5623)
        if (uri && Firebug.TabWatcher.shouldCreateContext(browser, uri.spec, null))
            Firebug.toggleBar(true);

        FBTrace.sysout("Firebug loaded by default since 'allPagesActivation' is on " +
            "or 'delayLoad' is false");
    });
}

// ********************************************************************************************* //

if (FBTrace.DBG_INITIALIZE)
    FBTrace.sysout("Firebug global overlay applied");

// ********************************************************************************************* //
})();
