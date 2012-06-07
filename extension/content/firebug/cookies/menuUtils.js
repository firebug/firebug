/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/locale",
],
function(Obj, Options, Locale) {

// ********************************************************************************************* //
// Menu Utils

var MenuUtils = 
{
    optionMenu: function(context, label, domain, option)
    {
        var value = Options.get(option);
        return { label: Locale.$STR(label), nol10n: true, type: "checkbox", checked: value,
            command: Obj.bindFixed(MenuUtils.setPref, this, domain, option, !value) };
    },

    optionAllowGlobally: function(context, label, domain, option)
    {
        var value = Options.get(option) == 0;
        return { label: Locale.$STR(label), nol10n: true, type: "checkbox",
            checked: value,
            command: Obj.bindFixed(this.onAllowCookie, this, domain, option)}
    },

    // Command handlers
    onAllowCookie: function(domain, option)
    {
        var value = Options.get(option);
        switch (value)
        {
            case 0: // accept all cookies by default
            Options.set(option, 2);
            return;

            case 1: // only accept from the originating site (block third party cookies)
            case 2: // block all cookies by default;
            case 3: // use p3p settings
            Options.set(option, 0);
            return;
        } 
    },

    onBlockCurrent: function()
    {
    },

    setPref: function(prefDomain, name, value)
    {
        Options.set(name, value);
    }
};

// ********************************************************************************************* //

return MenuUtils;

// ********************************************************************************************* //
});

