/* See license.txt for terms of usage */

/**
 * This file defines MutationRecognizer APIs for test drivers.
 */

// ********************************************************************************************* //

/**
 * This object is intended for handling HTML changes that can occur on a page.
 * This is useful e.g. in cases when a test expects a specific element to be created and
 * wants to asynchronously wait for it.
 *
 * @param {MutationFilterConfig} config -
 *     [Mutation filter configuration]{@link MutationFilterConfig}
 */
var MutationRecognizer = function(config)
{
    FBTrace.sysout("MutationRecognizer", config);
    this.target = config.target;
    this.mutationFilter = new MutationFilter(config);
};

/**
 * Returns the mutation filter configuration as string
 * @returns {String} Filter configuration string
 */
MutationRecognizer.prototype.getDescription = function()
{
    return this.mutationFilter.getDescription();
};

/**
 * Mutation callback function
 *
 * @callback MutationRecognizer~mutationCallback
 * @param {Object} node - Recognized node; can be an element or character data
 */

/**
 * Recognizes specific HTML/XML structure changes and calls a callback function synchronously.
 *
 * @param {mutationCallback} handler - Callback function that handles the found node.
 */
MutationRecognizer.prototype.onRecognize = function(handler)
{
    var self = this;
    var observer = new MutationObserver((mutations) =>
    {
        var node = self.mutationFilter.filter(mutations);
        FBTest.sysout("FBTest.MutationRecognizer.onRecognizeAsync:", node);
        if (node)
        {
            observer.disconnect();
            handler(node);
        }
    });

    FBTrace.sysout("MutationRecognizer.onRecognize", {target: this.target, config: this.mutationFilter.getMutationObserverConfig()});
    observer.observe(this.target, this.mutationFilter.getMutationObserverConfig());
};

/**
 * Recognizes specific HTML/XML structure changes and calls a callback function asynchronously.
 *
 * @param {mutationCallback} handler - Callback function that handles the found node.
 * @delay {Number} [delay=10] - Number of milliseconds to wait before the callback function is called.
 */
MutationRecognizer.prototype.onRecognizeAsync = function(handler, delay)
{
    if (!delay)
        delay = 10;

    var self = this;
    var observer = new MutationObserver((mutations) =>
    {
        FBTrace.sysout("FBTest.MutationRecognizer.mutationFilter", mutations);
        var node = self.mutationFilter.filter(mutations);
        FBTest.sysout("FBTest.MutationRecognizer.onRecognizeAsync:", node);
        if (node)
        {
            observer.disconnect();
            setTimeout(() =>
            {
                handler(node);
            }, delay);
        }
    });

    FBTrace.sysout("MutationRecognizer.onRecognizeAsync", {target: this.target, config: this.mutationFilter.getMutationObserverConfig()});
    observer.observe(this.target, this.mutationFilter.getMutationObserverConfig());
};
