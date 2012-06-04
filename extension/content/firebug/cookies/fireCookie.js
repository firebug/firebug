/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/persist",
    "firebug/lib/string",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/cookies/baseObserver",
    "firebug/cookies/menuUtils",
    "firebug/cookies/templates",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookieObserver",
    "firebug/cookies/cookieClipboard",
    "firebug/chrome/tabWatcher",
    "firebug/cookies/cookieModule",
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, MenuUtils, Templates, CookieUtils, Cookie, Breakpoints, CookieObserver,
    CookieClipboard, TabWatcher, FireCookieModel) {

// ********************************************************************************************* //

with (Domplate) {

/**
 * @author <a href="mailto:odvarko@gmail.com">Jan Odvarko</a>
 * @namespace Holds all functionality related to the Firecookie extension.
 * There are no global objects defined to avoid collisions with other
 * extensions.
 * 
 * Compatibility:
 * - The official minimum required Firebug version is 1.4
 * 
 * 1) context.getName() has been introduced in Firebug 1.4. But this is only
 *    used for tracing.
 * 2) getWindowForRequest & getTabIdForWindow are now expected to exists (Firebug 1.3).
 * 3) getWindowForRequest & getTabIdForWindow don't exists (Firebug 1.8).
 */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupportsWeakReference = Ci.nsISupportsWeakReference;
const nsISupports = Ci.nsISupports;
const nsICookieService = Ci.nsICookieService;
const nsICookie2 = Ci.nsICookie2;
const nsIObserver = Ci.nsIObserver;
const nsICookiePermission = Ci.nsICookiePermission;
const nsIURI = Ci.nsIURI;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsISupportsString = Ci.nsISupportsString;
const nsIPermissionManager = Ci.nsIPermissionManager;
const nsIWebProgress = Ci.nsIWebProgress;
const nsIDOMWindow = Ci.nsIDOMWindow;
const nsIInterfaceRequestor = Ci.nsIInterfaceRequestor;
const nsIHttpChannel = Ci.nsIHttpChannel;
const nsIPermission = Ci.nsIPermission;
const nsIXULAppInfo = Ci.nsIXULAppInfo;
const nsIVersionComparator = Ci.nsIVersionComparator;
const nsIFilePicker = Ci.nsIFilePicker;

// Firefox Preferences
const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";
const cookieLifeTimePref = "lifetimePolicy";

// Firecookie preferences
const clearWhenDeny = "firecookie.clearWhenDeny";
const defaultExpireTime = "firecookie.defaultExpireTime";
const removeConfirmation = "firecookie.removeConfirmation";
const removeSessionConfirmation = "firecookie.removeSessionConfirmation";

// Services
const cookieManager = Xpcom.CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const cookieService = Xpcom.CCSV("@mozilla.org/cookieService;1", "nsICookieService");
const observerService = Xpcom.CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const permissionManager = Xpcom.CCSV("@mozilla.org/permissionmanager;1", "nsIPermissionManager");
const appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
const versionChecker = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const ioService = Xpcom.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
const dateFormat = Xpcom.CCSV("@mozilla.org/intl/scriptabledateformat;1", "nsIScriptableDateFormat");
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// Preferences
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefService = Ci.nsIPrefService;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefService = PrefService.getService(nsIPrefService);
const prefs = PrefService.getService(nsIPrefBranch2);

// Cookie panel ID.
const panelName = "cookies";

// ********************************************************************************************* //
// Cookie Helpers


// ********************************************************************************************* //
// Firebug Registration

// ********************************************************************************************* //
}});

