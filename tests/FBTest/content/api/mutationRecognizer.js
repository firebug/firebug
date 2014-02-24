/* See license.txt for terms of usage */

/**
 * This file defines MutationRecognizer APIs for test drivers.
 */

// ********************************************************************************************* //

/**
 * This object is intended for handling HTML changes that can occur on a page.
 * This is useful e.g. in cases when a test expects specific element to be created and
 * wants to asynchronously wait for it.
 * @param {Window} win Parent window.
 * @param {String} tagName Name of the element.
 * @param {Object} attributes List of attributes that identifies the element.
 * @param {String} text Specific text that should be created. The tagName must be set to
 * @param {Object} attributes to be watched, defaults to 'attributes'; use for removals
 * <i>Text</i> in this case.
 *
 * @class
 */
var MutationRecognizer = function(win, tagName, attributes, text, changedAttributes)
{
   this.win = win;
   this.tagName = tagName;
   this.attributes = attributes || {};
   this.characterData = text;

   this.changedAttributes = changedAttributes;
};

MutationRecognizer.prototype.getDescription = function()
{
    var obj = {
        tagName: this.tagName,
        attributes: this.attributes,
        characterData: this.characterData,
        changedAttributes: this.changedAttributes,
    };

    return JSON.stringify(obj);
};

/**
 * Passes a callback handler that is called when specific HTML change
 * occurs on the page.
 * @param {Function} handler Callback handler gets one parameter specifying the founded element.
 */
MutationRecognizer.prototype.onRecognize = function(handler)
{
    return new MutationEventFilter(this, handler);
};

/**
 * Passes a callback handler that is called when specific HTML change
 * occurs on the page. After the change is caught, the handler is executed yet
 * asynchronously.
 * @param {Function} handler Callback handler gets one parameter specifying the founded element.
 * @delay {Number} delay Number of milliseconds delay (10ms by default).
 */
MutationRecognizer.prototype.onRecognizeAsync = function(handler, delay)
{
    if (!delay)
        delay = 10;

    return new MutationEventFilter(this, function(element) {
        setTimeout(function delayMutationEventFilter() {
            FBTest.sysout("testFirebug.MutationEventFilter.onRecognizeAsync:", element);
            handler(element);
        }, delay);
    });
};

MutationRecognizer.prototype.getWindow = function()
{
    return this.win;
};

MutationRecognizer.prototype.matches = function(elt, event)
{
    // Note Text nodes have no tagName
    if (this.tagName == "Text")
    {
        // The content must be exactly the same to avoid coincidental matches.
        // Yet better way is to specify classes of the parent element (attributes).
        if (elt.data && elt.data == this.characterData)
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("MutationRecognizer matches Text character data: " +
                    this.characterData, elt.parentNode);

            var parentNode = elt.parentNode;

            // If a class is specified the parent of the text node must match.
            if (this.attributes && this.attributes["class"] &&
                !FW.FBL.hasClass.apply(FW.FBL, [parentNode, this.attributes["class"]]))
            {
                if (FBTrace.DBG_TESTCASE_MUTATION)
                    FBTrace.sysout("MutationRecognizer no match for class " +
                        this.attributes[p]+" vs "+eltP+" p==class: "+(p=='class') +
                        " indexOf: "+eltP.indexOf(this.attributes[p]));
                return null;
            }

            return parentNode;
        }
        else
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("MutationRecognizer no match in Text character data "+
                    this.characterData+" vs "+elt.data,{element: elt, recogizer: this});
            return null;
        }
    }

    if (!(elt instanceof Element))
    {
        if (FBTrace.DBG_TESTCASE_MUTATION)
            FBTrace.sysout("MutationRecognizer Node not an Element ", elt);
        return null;
    }

    if (elt.tagName && (elt.tagName.toLowerCase() != this.tagName) )
    {
        if (FBTrace.DBG_TESTCASE_MUTATION)
            FBTrace.sysout("MutationRecognizer no match on tagName "+this.tagName+
                " vs "+elt.tagName.toLowerCase()+" "+FW.FBL.getElementCSSSelector(elt),
                {element: elt, recogizer: this});
        return null;
    }

    for (var p in this.attributes)
    {
        if (this.attributes.hasOwnProperty(p))
        {
            var eltP = elt.getAttribute(p);
            if (!eltP)
            {
                if (FBTrace.DBG_TESTCASE_MUTATION)
                    FBTrace.sysout("MutationRecognizer no attribute "+p+" in "+
                        FW.FBL.getElementHTML(elt), {element: elt, recogizer: this});
                return null;
            }
            if (this.attributes[p] != null)
            {
                if (p == 'class')
                {
                    if (!FW.FBL.hasClass.apply(FW.FBL, [elt, this.attributes[p]]))
                    {
                        if (FBTrace.DBG_TESTCASE_MUTATION)
                            FBTrace.sysout("MutationRecognizer no match for class " +
                                this.attributes[p]+" vs "+eltP+" p==class: "+(p=='class') +
                                " indexOf: "+eltP.indexOf(this.attributes[p]));
                        return null;
                    }
                }
                else if (eltP != this.attributes[p])
                {
                    if (FBTrace.DBG_TESTCASE_MUTATION)
                        FBTrace.sysout("MutationRecognizer no match for attribute "+p+": "+
                            this.attributes[p]+" vs "+eltP,{element: elt, recogizer: this});
                    return null;
                }
            }
        }
    }

    if (this.characterData)
    {
        if (elt.textContent.indexOf(this.characterData) < 0)
        {
            if (FBTrace.DBG_TESTCASE_MUTATION)
                FBTrace.sysout("MutationRecognizer no match for characterData "+
                    this.characterData+" vs "+elt.textContent, {element: elt, recogizer: this});
            return null;
        }
    }

    // If the attribute name is 'class' and the value is specified, check
    // that value has been removed
    if (this.changedAttributes)
    {
        if (!this.changedAttributes[event.attrName])
            return null;

        var watchValue = this.changedAttributes[event.attrName];
        if (!watchValue)
            return null;

        if (event.attrName != "class")
            return null;

        var result = diffString(event.prevValue, event.newValue);
        result = removeWhitespaces(result);

        var value = "<del>" + watchValue + "</del>";
        if (result.indexOf(value) == -1)
            return null;
    }

    // tagName and all attributes match
    FBTest.sysout("MutationRecognizer tagName and all attributes match "+elt, elt);
    return elt;
};

// ********************************************************************************************* //
// Local Helpers

function removeWhitespaces(value)
{
    return value.replace(/[\r\n\s]+/g, "");
}

// ********************************************************************************************* //
