/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/options"
],
function(Firebug, FBTrace, Css, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Implementation

/**
 * MeasureBox
 * To get pixels size.width and size.height:
 *
 * <ul>
 *   <li>this.startMeasuring(view);</li>
 *   <li>var size = this.measureText(lineNoCharsSpacer);</li>
 *   <li>this.stopMeasuring();</li>
 * </ul>
 */
var MeasureBox =
/** @lends MeasureBox */
{
    startMeasuring: function(target)
    {
        if (!this.measureBox)
        {
            this.measureBox = target.ownerDocument.createElement("span");
            this.measureBox.className = "measureBox";
        }

        Css.copyTextStyles(target, this.measureBox);

        target.ownerDocument.body.appendChild(this.measureBox);
    },

    getMeasuringElement: function()
    {
        return this.measureBox;
    },

    measureText: function(value)
    {
        this.measureBox.textContent = value || "m";

        return {
            width: this.measureBox.offsetWidth,
            height: this.measureBox.offsetHeight - 1
        };
    },

    measureInputText: function(value)
    {
        if (!value)
            value = "m";

        if (!Options.get("showTextNodesWithWhitespace"))
            value = value.replace(/\t/g, "mmmmmm").replace(/\ /g, "m");

        this.measureBox.textContent = value;

        return {
            width: this.measureBox.offsetWidth,
            height: this.measureBox.offsetHeight - 1
        };
    },

    getBox: function(target)
    {
        var style = this.measureBox.ownerDocument.defaultView.getComputedStyle(this.measureBox, "");
        var box = Css.getBoxFromStyles(style, this.measureBox);
        return box;
    },

    stopMeasuring: function()
    {
        this.measureBox.parentNode.removeChild(this.measureBox);
    }
};

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility
Firebug.MeasureBox = MeasureBox;

return MeasureBox;

// ********************************************************************************************* //
});
