/* See license.txt for terms of usage */

/**
 * This file defines MutationFilter APIs for test drivers.
 */

// ********************************************************************************************* //
// Mutation Filter API

/**
 * Mutation filter element
 *
 * @typedef {Object} MutationFilterElement
 * @property {String} name - Tag name that will be searched for
 * @property {Object} attributes - Name/value pairs of attributes that will be searched for
 */

/**
 * Mutation filter config
 *
 * @typedef {Object} MutationFilterConfig
 * @property {Element} target - Element that will be observed
 * @property {MutationFilterElement} [addedChildTag] - Added element the filter is searching for
 * @property {MutationFilterElement} [removedChildTag] -
 *     Removed element the filter is searching for
 * @property {String} changedAttribute - Name of the changed attribute the filter is searching for
 * @property {String} characterData - Text content that the filter is searching for
 */

/**
 * HTML/XML mutation filter
 *
 * @param {MutationFilterConfig} config - Filter configuration
 */
function MutationFilter(config)
{
    this.target = config.target;
    this.tagName = config.tagName;
    this.attributes = config.attributes;
    this.text = config.text;
    this.removed = !!config.removed;

    FBTrace.sysout("MutationFilter", this);
}

/**
 * Filter callback function for Mutation Observer
 * @external MutationObserver
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver}
 *
 * @param {Object} mutations - Array of mutation records
 * @returns {Element|NodeAttribute|TextNode} In case the filter is searching for an element the
 *     element is returned, in case a changed attribute is searched the attribute is returned, and
 *     in case a text is searched a text node is returned
 */
MutationFilter.prototype.filter = function(mutations)
{
    function checkAttributes(mutation, attributes, removed)
    {
        for (var name in attributes)
        {
            var attribute = mutation.target.attributes.getNamedItem(name);

            // If we're searching for added attributes and the element doesn't contain the
            // attribute, it's not the searched one.
            if (!removed && !attribute)
                return false;

            if (name === "class")
            {
                if (removed)
                {
                    // In case we're searching for removed classes, go through all classes that
                    // shall be matched and check whether the mutated element previously contained
                    // them but now not anymore.
                    var checkedClassNames = attributes[name].split(" ");
                    var classList = mutation.target.classList;
                    for (var j = 0; j < checkedClassNames.length; j++)
                    {
                        // If the element didn't contain one of the classes or still contains one
                        // of them, it's not the searched element.
                        if (!mutation.oldValue.contains(checkedClassNames[j]) ||
                            classList.contains(checkedClassNames[j]))
                        {
                            return false;
                        }
                    }
                }
                else
                {
                    // In case we're searching for added classes, go through all classes that
                    // shall be matched and check whether the mutated element contains them.
                    var checkedClassNames = attributes[name].split(" ");
                    var classList = mutation.target.classList;
                    for (var j = 0; j < checkedClassNames.length; j++)
                    {
                        // If the element doesn't contain the class, it's not the searched one.
                        if (!classList.contains(checkedClassNames[j]))
                            return false;
                    }
                }
            }
            else
            {
                return (removed ? attribute.value !== attributes[name] :
                    attribute.value === attributes[name]);
            }
        }

        return true;
    }

    for (var i = 0; i < mutations.length; i++)
    {
        var mutation = mutations[i];
        FBTrace.sysout("mutation "+mutation.type, mutation);
        switch (mutation.type)
        {
            // If the mutation is related to a child, search for the element via an XPath
            case "childList":
                if (!this.xpath)
                    this.xpath = this.createXPath();

                var nodeType = this.removed ? "removedNodes" : "addedNodes";
                for (var j = 0; j < mutation[nodeType].length; j++)
                {
                    var matchingElements = this.xpath.evaluate(mutation[nodeType][j],
                        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    if (matchingElements.snapshotLength !== 0)
                        return matchingElements.snapshotItem(0);
                }
                break;

            // If the mutation is related to some attributes of an element, check these attributes
            case "attributes":
                if (!this.attributes)
                    continue;

                if (!checkAttributes(mutation, this.attributes, this.removed))
                    continue;

                return mutation.target;
                break;

            // If the mutation is related to the text content of an element, check the content
            case "characterData":
                if (!this.text)
                    continue;

                if (mutation.target.data === this.characterData)
                    return mutation.target;
                break;
        }
    }

    return null;
};

/**
 * Returns the Mutation Observer configuration for the mutation filter
 * @returns {Object} Mutation Observer configuration
 */
MutationFilter.prototype.getMutationObserverConfig = function()
{
    var config = {
        childList: true,
        subtree: true
    };

    if (this.attributes)
    {
        config.attributes = true;
        config.attributeFilter = Object.keys(this.attributes);

        if (this.removed)
            config.attributeOldValue = true;
    }

    if (this.text)
    {
        config.characterData = true;

        if (this.removed)
            config.characterDataOldValue = true;
    }

    return config;
};

/**
 * Returns the mutation filter configuration as string
 * @returns {String} Filter configuration string
 */
MutationFilter.prototype.getDescription = function()
{
    var obj = {
        target: this.target.localName + (this.target.id ? "#" + this.target.id : ""),
        tagName: this.tagName,
        attributes: this.attributes,
        text: this.text,
        removed: this.removed
    };

    return JSON.stringify(obj);
};

/**
 * Returns an XPath for the given filter configuration
 * @returns {Object} XPath for matching elements according to the filter configuration
 */
MutationFilter.prototype.createXPath = function ()
{
    var xpath = "//" + (this.tagName || "*");

    if (this.attributes)
    {
        for (name in this.attributes)
        {
            if (name === "class")
            {
                var classes = this.attributes[name].split(" ");
                xpath += "[" + classes.map(
                    (currentClass) => "contains(concat(' ', normalize-space(@class), ' '), ' " +
                        currentClass + " ')").join(" and ") +
                    "]";
            }
            else
            {
                xpath += "[@" + name + "='" + this.attributes[name] + "']";
            }
        }
    }

    if (this.text)
        xpath += "[contains(text(), '" + this.text + "')]";

    try
    {
        FBTrace.sysout("xpath", xpath);
        return this.target.ownerDocument.createExpression(xpath, null);
    }
    catch (e)
    {
        //if (FBTrace.DBG_ERROR)
            FBTrace.sysout("MutationFilter.createXPath; XPath couldn't be created", e);
        return null;
    }
};
