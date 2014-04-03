/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/debugger/stack/stackFrame",
    "firebug/chrome/rep",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/css",
    "firebug/lib/options",
    "firebug/lib/dom",
],
function(FBTrace, Obj, Arr, Url, Str, Locale, Firebug, Domplate, StackFrame, Rep,
    SourceLink, Css, Options, Dom) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, SPAN, TR, A} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// StackFrame Rep

var StackFrameRep = domplate(Rep,
{
    className: "stackFrame",
    inspectable: false,

    tag:
        Rep.tags.OBJECTBLOCK({$hasTwisty: "$object|hasArguments", _repObject: "$object",
            onclick: "$onToggleArguments"},
            SPAN({"class": "stackFrameMarker"}, ""),
            A({"class": "objectLink a11yFocus", _repObject: "$object"}, "$object|getCallName"),
            SPAN("("),
            SPAN({"class": "arguments"},
                FOR("arg", "$object|argIterator",
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("="),
                    TAG("$arg.tag", {object: "$arg.value"}),
                    SPAN({"class": "arrayComma"}, "$arg.delim")
                )
            ),
            SPAN(")"),
            SPAN({"class": "objectLink-sourceLink objectLink a11yFocus",
                _repObject: "$object|getSourceLink",
                role: "link"},
                "$object|getSourceLinkTitle"),
            DIV({"class": "argList"})
        ),

    argList:
        DIV({"class": "argListBox", onclick: "$onSelectFrame"},
            FOR("arg", "$object|argIterator",
                DIV({"class": "argBox"},
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("&nbsp;=&nbsp;"),
                    TAG("$arg.tag", {object: "$arg.value"})
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getTitle: function(frame)
    {
        return frame.getFunctionName();
    },

    hasArguments: function(frame)
    {
        return frame.args.length;
    },

    getCallName: function(frame)
    {
        return frame.getFunctionName();
    },

    getSourceLinkTitle: function(frame)
    {
        var fileName = Url.getFileName(frame.href);

        var maxWidth = Options.get("sourceLinkLabelWidth");
        if (maxWidth > 0)
            var fileName = Str.cropString(fileName, maxWidth);

        return Locale.$STRF("Line", [fileName, frame.line]);
    },

    argIterator: function(frame)
    {
        if (!frame.args)
            return [];

        var items = [];

        for (var i = 0; i < frame.args.length; ++i)
        {
            var arg = frame.args[i];

            if (!arg)
                break;

            if (arg.hasOwnProperty('value')) // then we got these from jsd
            {
                var rep = Firebug.getRep(arg.value);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                var delim = (i == frame.args.length-1 ? "" : ", ");

                items.push({name: arg.name, value: arg.value, tag: tag, delim: delim});
            }
            else if (arg.hasOwnProperty('name'))
            {
                items.push({name: arg.name, delim: delim});
            }
            else  // eg from Error object
            {
                var delim = (i == frame.args.length-1 ? "" : ", ");
                var rep = Firebug.getRep(arg);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                items.push({value: arg, tag: tag, delim: delim});
            }
        }

        return items;
    },

    getSourceLink: function(stackFrame)
    {
        var sourceLink = new SourceLink(stackFrame.href, stackFrame.line, "js");
        return sourceLink;
    },

    onToggleArguments: function(event)
    {
        this.toggleArguments(event.originalTarget);
    },

    toggleArguments: function(target)
    {
        if (Css.hasClass(target, "objectBox-stackFrame"))
        {
            if (Css.hasClass(target, "opened"))
                this.collapseArguments(target);
            else
                this.expandArguments(target);
        }
    },

    collapseArguments: function(target)
    {
        if (!Css.hasClass(target, "opened"))
            return;

        Css.toggleClass(target, "opened");

        var argList = target.getElementsByClassName("argList").item(0);
        Dom.clearNode(argList);
    },

    expandArguments: function(target)
    {
        if (Css.hasClass(target, "opened"))
            return;

        var frame = target.repObject;
        if (!this.hasArguments(frame))
            return;

        Css.toggleClass(target, "opened");

        var argList = target.getElementsByClassName("argList").item(0);
        this.argList.replace({object: frame}, argList);
    },

    onSelectFrame: function(event)
    {
        var target = event.currentTarget;
        if (Css.hasClass(target, "argListBox"))
        {
            var stackFrame = Dom.getAncestorByClass(target, "objectBox-stackFrame");
            var panel = Firebug.getElementPanel(target);
            this.inspectObject(stackFrame.repObject, panel.context);

            Events.cancelEvent(event);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Rep

    supportsObject: function(object, type)
    {
        return object instanceof StackFrame;
    },

    inspectObject: function(stackFrame, context)
    {
        if (context.stopped)
            Firebug.chrome.select(stackFrame);
        else
            Firebug.chrome.select(this.getSourceLink(stackFrame));
    },

    getTooltip: function(stackFrame, context)
    {
        return Locale.$STRF("Line", [stackFrame.href, stackFrame.line]);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(StackFrameRep);

return StackFrameRep;

// ********************************************************************************************* //
});
