/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
],
function(Obj, Options) {

// ********************************************************************************************* //
// Menu Utils

var MenuUtils =
{
    optionMenu: function(context, label, tooltiptext, domain, option)
    {
        var value = Options.getPref(domain, option), self = this;
        return {
            label: label,
            tooltiptext: tooltiptext,
            type: "checkbox",
            checked: value,
            command: function()
            {
                var checked = this.hasAttribute("checked");
                self.setPref(domain, option, checked);
            }
        };
    },

    optionAllowGlobally: function(context, label, tooltiptext, domain, option)
    {
        var value = Options.getPref(domain, option) == 0;
        return {
            label: label,
            tooltiptext: tooltiptext,
            type: "checkbox",
            checked: value,
            command: Obj.bindFixed(this.onAllowCookie, this, domain, option)
        };
    },

    // Command handlers
    onAllowCookie: function(domain, option)
    {
        var value = Options.getPref(domain, option);
        switch (value)
        {
            case 0: // accept all cookies by default
            Options.setPref(domain, option, 2);
            return;

            case 1: // only accept from the originating site (block third party cookies)
            case 2: // block all cookies by default;
            case 3: // use p3p settings
            Options.setPref(domain, option, 0);
            return;
        }
    },

    onBlockCurrent: function()
    {
    },

    setPref: function(domain, name, value)
    {
        Options.setPref(domain, name, value);
    }
};

// ********************************************************************************************* //

return MenuUtils;

// ********************************************************************************************* //
});

