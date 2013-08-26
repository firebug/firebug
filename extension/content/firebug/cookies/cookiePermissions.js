/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/xpcom",
    "firebug/lib/locale",
    "firebug/lib/options",
],
function(Obj, Xpcom, Locale, Options) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var permissionManager = Xpcom.CCSV("@mozilla.org/permissionmanager;1", "nsIPermissionManager");

// Firefox Preferences
const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";
const cookieLifeTimePref = "lifetimePolicy";

// The second item in the array says if the localized string expects
// a domain name at the end.
const permOptions =
{
    "default-session": ["cookies.default.session", false],
    "default-third-party-session": ["cookies.default.thirdPartySession", false],
    "default-third-party": ["cookies.default.thirdParty", false],
    "default-limit-third-party": ["cookies.default.limitThirdParty", false],
    "default-allow": ["cookies.default.allow", false],
    "default-deny": ["cookies.default.deny", false],
    "default-warn": ["cookies.default.warn", false],
    "host-allow-session": ["cookies.host.session", true],
    "host-allow": ["cookies.host.accept", true],
    "host-deny": ["cookies.host.reject", true],
    "host-limit-third-party": ["cookies.host.limitThirdParty", true],
};

// ********************************************************************************************* //
// Cookie Permissions

/**
 * @class This class is responsible for managing cookie permissions.
 */
var CookiePermissions = Obj.extend(Object,
/** @lends CookiePermissions */
{
    onCommand: function(event, context, location)
    {
        var menu = event.target;
        this.setPermission(context, menu.value, location);
    },

    onTooltipShowing: function(tooltip, context)
    {
        if (tooltip.fcEnabled)
        {
            var host = context.window.location.host;
            tooltip.label = Locale.$STRF("cookies.perm.manage.tooltip", [host]);
        }

        return tooltip.fcEnabled;
    },

    onPopupShowing: function(menu, context)
    {
        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = false;

        var items = menu.getElementsByTagName("menuitem");
        var location = context.browser.currentURI;

        var value = this.getPermission(location);
        var defaultValue = (value.indexOf("default") == 0) ? value : this.getDefaultPref();

        items[0].value = defaultValue;

        for (var i=0; i<items.length; i++)
        {
            var option = items[i].value;
            if (option == value)
                items[i].setAttribute("checked", "true");
            items[i].label = this.getLabel(option, location);
        }

        return true;
    },

    onPopupHiding: function(menu, context)
    {
        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = true;
        return true;
    },

    getContextMenuItems: function(cookie, target, context)
    {
        if (context.browser.currentURI.host == cookie.cookie.host)
            return null;

        var location = cookie.getURI();
        var value = this.getPermission(location);
        var defaultValue = (value.indexOf("default") == 0) ? value : this.getDefaultPref();

        var items = [];
        items.push("-");

        var menu = Firebug.chrome.$("fcPermMenuPopup");
        menu.childNodes[0].value = defaultValue;
        for (var i=0; i<menu.childNodes.length; i++)
        {
            var item = menu.childNodes[i];
            var option = item.value;

            items.push({
                label: this.getLabel(option, location),
                type: "radio",
                checked: (option == value),
                nol10n: true,
                command: Obj.bindFixed(this.onCommand, this, {target: item}, context, location),
            });
        }

        return items;
    },

    getPermission: function(location)
    {
        switch (permissionManager.testPermission(location, "cookie"))
        {
            case Ci.nsIPermissionManager.ALLOW_ACTION:
                return "host-allow";
            case Ci.nsIPermissionManager.DENY_ACTION:
                return "host-deny";
            case Ci.nsICookiePermission.ACCESS_SESSION:
                return "host-allow-session";
            case Ci.nsICookiePermission.ACCESS_LIMIT_THIRD_PARTY:
                return "host-limit-third-party";

            default:
                return this.getDefaultPref();
        }
    },

    setPermission: function(context, option, location)
    {
        var location = location ? location : context.browser.currentURI;
        permissionManager.remove(location.host, "cookie");
        switch(option)
        {
            case "host-allow-session":
                permissionManager.add(location, "cookie", Ci.nsICookiePermission.ACCESS_SESSION);
                break;
            case "host-limit-third-party":
                permissionManager.add(location, "cookie", Ci.nsICookiePermission.ACCESS_LIMIT_THIRD_PARTY);
                break;
            case "host-allow":
                permissionManager.add(location, "cookie", permissionManager.ALLOW_ACTION);
                break;
            case "host-deny":
                permissionManager.add(location, "cookie", permissionManager.DENY_ACTION);

            case "default-deny":
                if (Options.get("cookies.clearWhenDeny"))
                    Firebug.CookieModule.onRemoveAllFromHost(context, location.host);
                break;
        }

        this.updatePermButton(context);
    },

    updatePermButton: function(context, chrome)
    {
        if (!chrome)
            chrome = context.chrome;

        // This is called through TabWatcher.iterateContexts and
        // "this" isn't passed along
        var location = context.browser.currentURI;
        var value = this.getPermission(location);

        var button = Firebug.chrome.$("fcPerm");
        button.label = this.getLabel(value, location);
        button.removeAttribute("disabled");
        button.setAttribute("value", value);
    },

    getLabel: function (option, location)
    {
        var optionInfo = permOptions[option];
        if (!optionInfo)
            return null;

        if (optionInfo[1])
            return Locale.$STRF(optionInfo[0], [location.host]);

        return Locale.$STR(optionInfo[0]);
    },

    getDefaultPref: function()
    {
        var behavior = Options.getPref(networkPrefDomain, cookieBehaviorPref);
        if (typeof(behavior) == "undefined")
            behavior = 0;

        if (behavior == 2)
            return "default-deny";

        switch (Options.getPref(networkPrefDomain, cookieLifeTimePref))
        {
            case 1:
                return "default-warn";
            case 2:
                return (behavior == 0) ? "default-third-party-session" : "default-session";
        }

        switch (behavior)
        {
            case 0:
                return "default-third-party";
            case 1:
                return "default-allow";
            case 3:
                return "default-limit-third-party";
        }

        return null;
    }
});

// ********************************************************************************************* //
// Registration

return CookiePermissions;

// ********************************************************************************************* //
});

