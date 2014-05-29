/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/rep",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/options",
],
function(Obj, Firebug, Rep, Domplate, FirebugReps, Locale, Events, Css, Dom, Str, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, TABLE, TBODY, TR, TD, IMG, SPAN, BUTTON, TAG} = Domplate;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKNOTIFICATION");

// ********************************************************************************************* //
// Breakpoint Notification

/**
 * @domplate Construct a break notification popup
 *
 * @param doc the document to contain the notification
 * @param cause info object for the popup, with these optional fields:
 *   strings: message, attrName
 *   elements: target
 *   objects: prevValue, newValue
 */
function BreakNotification(cause, listener)
{
    this.cause = cause;
    this.listener = listener;
}

BreakNotification.prototype = domplate(Rep,
/** @lends BreakNotification */
{
    tag:
        DIV({"class": "notificationBox"},
            TABLE({"class": "notificationTable", onclick: "$onHide",
                onmouseover: "$onMouseOver", onmouseout: "$onMouseOut"},
                TBODY(
                    TR(
                        TD({"class": "imageCol"},
                            IMG({"class": "notificationImage",
                                src: "chrome://firebug/skin/breakpoint.svg"})
                        ),
                        TD({"class": "descCol"},
                            SPAN({"class": "notificationDesc"}, "$cause|getDescription"),
                            SPAN("&nbsp;"),
                            SPAN({"class": "diff"}, "$cause|getDiff"),
                            SPAN({"class": "targets"}),
                            DIV({"class": "noNotificationDesc"})
                        ),
                        TD({"class": "buttonsCol"},
                            BUTTON({"class": "notificationButton copyButton",
                                onclick: "$onCopyAction",
                                $collapsed: "$cause|hideCopyAction"},
                                Locale.$STR("Copy")
                            ),
                            BUTTON({"class": "notificationButton skipButton",
                                onclick: "$onSkipAction",
                                $collapsed: "$cause|hideSkipAction"},
                                Locale.$STR("script.balloon.Disable")
                            ),
                            BUTTON({"class": "notificationButton okButton",
                                onclick: "$onOkAction",
                                $collapsed: "$cause|hideOkAction"},
                                Locale.$STR("script.balloon.Continue")
                            )
                        ),
                        TD(
                            DIV({"class": "notificationClose", onclick: "$onHide"})
                        )
                    )
                )
            )
        ),

    targets:
        SPAN(
            SPAN("&nbsp;"),
            TAG("$cause|getTargetTag", {object: "$cause.target"}),
            SPAN("&nbsp;"),
            TAG("$cause|getRelatedTargetTag", {object: "$cause.relatedNode"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseOver: function(event)
    {
        var target = event.target;
        var box = Dom.getAncestorByClass(target, "notificationBox");
        var close = box.querySelector(".notificationClose");

        // The close button is "active" (red) if the mouse hovers over the notification
        // area except when it hovers over a button or link.
        var localName = target.localName ? target.localName.toLowerCase() : "";
        if (Css.hasClass(target, "notificationButton") || localName == "a")
            close.removeAttribute("active");
        else
            close.setAttribute("active", true);
    },

    onMouseOut: function(event)
    {
        var box = Dom.getAncestorByClass(event.target, "notificationBox");
        var close = box.querySelector(".notificationClose");
        close.removeAttribute("active");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onHide: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        notify.hide();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getDescription: function(cause)
    {
        var str = cause.message + (cause.attrName ? (" '" + cause.attrName + "'") : "");
        if (this.getDiff(cause))
            str += ":";

        return str;
    },

    getTargetTag: function(cause)
    {
        return this.getElementTag(cause.target) || null;
    },

    getRelatedTargetTag: function(cause)
    {
        return this.getElementTag(cause.relatedNode) || null;
    },

    getElementTag: function(node)
    {
        if (node)
        {
            var rep = Firebug.getRep(node);
            if (rep)
                return rep.shortTag || rep.tag;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Button Handlers

    hideCopyAction: function(cause)
    {
        return !cause.copyAction;
    },

    hideSkipAction: function(cause)
    {
        return !cause.skipAction;
    },

    hideOkAction: function(cause)
    {
        return !cause.okAction;
    },

    onCopyAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.copyAction)
            notify.cause.copyAction();
    },

    onSkipAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.skipAction)
            notify.cause.skipAction();
    },

    onOkAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.okAction)
            notify.cause.okAction();
    },

    onCloseAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.onCloseAction)
            notify.cause.onCloseAction();
        else
            notify.hide(event); // same as click on notify body
    },

    getNotifyObject: function(target)
    {
        var parentNode = Dom.getAncestorByClass(target, "notificationBox");
        return parentNode.repObject;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Action handlers from "do not show again" description

    onClickLink: function(event)
    {
        this.showTabMenu(event);
    },

    disableNotifications: function(event)
    {
        Firebug.setPref(Firebug.prefDomain, "showBreakNotification", false);

        // Hide the notification, but default processing of this event would hide it anyway.
        this.onHide(event);
    },

    showTabMenu: function(event)
    {
        // Open panel's tab menu to show the "Show Break Notifications" option
        // to teach the user where to enable it again.
        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab("script");
        tab.tabMenu.showMenu();

        // Avoid default processing that hides the notification popup.
        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    getDiff: function(cause)
    {
        var str = "";

        if (cause.prevValue)
            str += Str.cropString(cause.prevValue, 40) + " -> ";

        if (cause.newValue)
            str += Str.cropString(cause.newValue, 40);

        if (!str.length)
            return "";

        if (!cause.target)
            return str;

        return str;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public

    show: function(parentNode)
    {
        Trace.sysout("breakNotification.show;");

        // Render the entire notification box.
        this.box = this.tag.append(this.cause, parentNode, this);
        this.box.repObject = this;

        // Make sure the notification box is at the top.
        parentNode.insertBefore(this.box, this.box.previousSibling);

        // Appends the HTML targets dynamically. In case they are null, it breaks
        // click events.
        // xxxHonza: this problem would deserve clarification.
        if (this.cause.target || this.cause.relatedNode)
        {
            var targetsNode = this.box.querySelector(".targets");
            this.targets.replace(this.cause, targetsNode, this);
        }

        // Render "do not show again" text
        var descNode = this.box.querySelector(".noNotificationDesc");
        FirebugReps.Description.render(Locale.$STR("firebug.breakpoint.doNotShowBreakNotification2"),
            descNode, Obj.bind(this.onClickLink, this));

        // Tooltips
        if (this.cause.skipActionTooltip)
            this.box.querySelector(".skipButton").setAttribute("title", this.cause.skipActionTooltip);
        if (this.cause.okActionTooltip)
            this.box.querySelector(".okButton").setAttribute("title", this.cause.okActionTooltip);
        if (this.cause.copyActionTooltip)
            this.box.querySelector(".copyButton").setAttribute("title", this.cause.copyActionTooltip);

        // xxxHonza: disable the animation, the interval seems to be frozen during debugger break.
        this.box.style.top = "0";

        this.listener.onNotificationShow(this);
        return;

        // Animation
        var self = this;
        var delta = Math.max(3, Math.floor(this.box.clientHeight/5));
        var clientHeight = this.box.clientHeight;

        this.box.style.top = -clientHeight + "px";
        var interval = setInterval(function slide(event)
        {
            var top = parseInt(self.box.style.top, 10);
            if (top >= 0)
            {
                clearInterval(interval);
            }
            else
            {
                var newTop = (top + delta) > 0 ? 0 : (top + delta);
                self.box.style.top = newTop + "px";
            }
        }, 15);

        return this.box;
    },

    hide: function()
    {
        Trace.sysout("breakNotification.hide; " + this.box);

        // xxxHonza: disable the animation, the interval seems to be frozen during debugger break.
        if (this.box.parentNode)
            this.box.parentNode.removeChild(this.box);

        this.listener.onNotificationHide(this);
        return;

        // Animation
        var self = this;
        var delta = Math.max(3, Math.floor(this.box.clientHeight/5));
        var clientHeight = this.box.clientHeight;
        var top = 0;

        var interval = setInterval(function slide(event)
        {
            top = top - delta;
            if (top < -clientHeight)
            {
                clearInterval(interval);

                if (self.box.parentNode)
                    self.box.parentNode.removeChild(self.box);
            }
            else
            {
                self.box.style.top = top + "px";
            }
        }, 15);
    }
});

// ********************************************************************************************* //
// Public API

BreakNotification.show = function(context, parentNode, breakType, listener)
{
    Trace.sysout("BreakNotification.show");

    // There is a global option that can be used to switch off the break notification
    // (it can be annoying sometimes)
    if (!Options.get("showBreakNotification"))
        return;

    // If there is no breaking cause object, there is nothing to display so, bail out.
    if (!context.breakingCause)
        return;

    var box = new BreakNotification(context.breakingCause, listener);
    box.show(parentNode);

    // Remember the box, we need to hide it when the debugger is resumed.
    context.breakingCauseBox = box;

    delete context.breakingCause;

    return box;
}

BreakNotification.hide = function(context)
{
    var box = context.breakingCauseBox;
    if (box)
        box.hide();

    delete context.breakingCauseBox;
}

// ********************************************************************************************* //
// Registration

return BreakNotification;

// ********************************************************************************************* //
});
