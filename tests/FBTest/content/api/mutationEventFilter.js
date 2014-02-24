/* See license.txt for terms of usage */

/**
 * This file defines MutationEventFilter APIs for test drivers.
 */

// ********************************************************************************************* //
// Constants

var filterInstance = 1;
var activeFilters = {};

// ********************************************************************************************* //
// Mutation Recognizer API

/** @class */
function MutationEventFilter(recognizer, handler)
{
    this.recognizer = recognizer;

    this.winName = new String(window.location.toString());
    var filter = this;
    this.onMutateAttr = function handleAttrMatches(event)
    {
        if (window.closed)
            throw "WINDOW CLOSED watching:: "+(filter.recognizer.win.closed?
                "closed":filter.recognizer.win.location)+" closed window: "+filter.winName;

        if (FBTrace.DBG_TESTCASE_MUTATION)
        {
            FBTrace.sysout("onMutateAttr " + event.attrName + "=>" + event.newValue +
                " (" + event.prevValue + ") " +
                " on " + event.target + " in " + event.target.ownerDocument.location,
                event.target);
        }

        var attrs = recognizer.attributes;
        var changed = recognizer.changedAttributes;

        // We care about some attribute mutation.
        if (!attrs.hasOwnProperty(event.attrName) &&
            !(changed && changed.hasOwnProperty(event.attrName)))
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("onMutateAttr not interested in "+event.attrName+"=>"+event.newValue+
                    " on "+event.target+" in "+event.target.ownerDocument.location, event.target);
            return;  // but not the one that changed.
        }

        try
        {
            if (filter.checkElement(event.target, event))
                handler(event.target);
        }
        catch (exc)
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("onMutateNode FAILS "+exc, exc);
        }
    };

    // the matches() function could be tuned to each kind of mutation for improved efficiency
    this.onMutateNode = function handleNodeMatches(event)
    {
        if (window.closed)
            throw "WINDOW CLOSED watching:: "+(filter.recognizer.win.closed?"closed":filter.recognizer.win.location)+" closed window: "+filter.winName;

        if (FBTrace.DBG_TESTCASE_MUTATION)
            FBTrace.sysout("onMutateNode "+event.target+" in "+event.target.ownerDocument.location, event.target);

        try
        {
            var child = filter.checkElementDeep(event.target, event);
            if (child)
                handler(child);
        }
        catch(exc)
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("onMutateNode FAILS "+exc, exc);
        }
    };

    this.onMutateText = function handleTextMatches(event)
    {
        if (window.closed)
            throw "WINDOW CLOSED watching:: "+(filter.recognizer.win.closed?"closed":filter.recognizer.win.location)+" closed window: "+filter.winName;

        if (!recognizer.characterData)
            return; // we don't care about text

        // We care about text and the text for this element mutated.  If it matches we must have hit.
        if (FBTrace.DBG_TESTCASE_MUTATION)
            FBTrace.sysout("onMutateText =>"+event.newValue+" on "+event.target.ownerDocument.location, event.target);

        try
        {
            if (filter.checkElement(event.target))  // target is CharacterData node
                handler(event.target);
        }
        catch(exc)
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("onMutateNode FAILS "+exc, exc);
        }
    };

    // TODO: xxxpedro
    //filter.checkElement = function(elt)
    this.checkElement = function(elt, event)
    {
        var element = recognizer.matches(elt, event);
        if (element)
        {
            filter.unwatchWindow(recognizer.getWindow());
            return element;
        }
        return null;
    };

    // TODO: xxxpedro
    //filter.checkElementDeep = function(elt)
    this.checkElementDeep = function(elt, event)
    {
        var element = filter.checkElement(elt, event);
        if (element)
        {
            return element;
        }
        else
        {
            var child = elt.firstChild;
            for (; child; child = child.nextSibling)
            {
                var element = this.checkElementDeep(child, event);
                if (element)
                    return element;
            }
        }

        return null;
    };

    filter.watchWindow(recognizer.win);
}

// ********************************************************************************************* //
// Mutation Event Filter

MutationEventFilter.prototype.watchWindow = function(win)
{
    var doc = win.document;
    doc.addEventListener("DOMAttrModified", this.onMutateAttr, false);
    doc.addEventListener("DOMCharacterDataModified", this.onMutateText, false);
    doc.addEventListener("DOMNodeInserted", this.onMutateNode, false);
    // doc.addEventListener("DOMNodeRemoved", this.onMutateNode, false);

    var filter = this;
    filterInstance++;
    activeFilters[filterInstance] = filter;
    this.filterInstance = filterInstance;

    // TODO: xxxpedro
    //filter.cleanUp = function(event)
    this.cleanUp = function(event)
    {
        try
        {
            if (window.closed)
            {
                throw new Error("Filter cleanup in window.closed event.target:"+event.target);
            }
            FBTest.sysout("Filter.cleanup "+filter.filterInstance);
            filter.unwatchWindow(win);
            document.removeEventListener("FBTestCleanup", filter.cleanUp, true);
        }
        catch (e)
        {
          FBTest.sysout("Filter.cleanup FAILS "+e, e);
        }
    };
    win.addEventListener("unload", filter.cleanUp, true);
    window.addEventListener("unload", filter.cleanUp, true);
    document.addEventListener("FBTestCleanup", filter.cleanUp, true);
    //window.FBTest.progress("added MutationWatcher to "+doc.location+" and FBTestCleanup to "+document.location);
    //window.FBTest.progress("added FBTestCleanup "+filterInstance+" to "+document.location);
};

MutationEventFilter.prototype.unwatchWindow = function(win)
{
    var doc = win.document;

    doc.removeEventListener("DOMAttrModified", this.onMutateAttr, false);
    doc.removeEventListener("DOMCharacterDataModified", this.onMutateText, false);
    doc.removeEventListener("DOMNodeInserted", this.onMutateNode, false);
    win.removeEventListener("unload", this.cleanUp, true);
    window.removeEventListener("unload", this.cleanUp, true);
    window.FBTest.sysout("unwatchWindow removed MutationWatcher "+this.filterInstance+" from "+doc.location);
    delete activeFilters[this.filterInstance];
};

// ********************************************************************************************* //
// Clean up

window.addEventListener('unload', function sayUnload()
{
    // TODO: xxxpedro why this log appears in red color?
    FBTest.sysout("UNLOAD MutationEventFilter "+window.location);
    for (var p in activeFilters)
    {
        FBTest.sysout(p+" still active filter ");
        activeFilters[p].cleanUp();
    }

}, true);

// ********************************************************************************************* //
