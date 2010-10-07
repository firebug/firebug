/**
 * Software License Agreement (BSD License)
 * 
 * Copyright (c) 2010 IBM Corporation.
 * All rights reserved.
 * 
 * Redistribution and use of this software in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer in the documentation and/or other
 *   materials provided with the distribution.
 * 
 * * Neither the name of IBM nor the names of its
 *   contributors may be used to endorse or promote products
 *   derived from this software without specific prior
 *   written permission of IBM.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Describes a root context in a browser - the content that has been served up
 * and is being rendered for a location (URL) that has been navigated to. 
 * 
 * @constructor
 * @param id unique context identifier, a {@link String} that cannot be <code>null</code>
 * @param url the URL associated with this context
 * @param browser the browser that contains the context
 * @type BrowserContext
 * @return a new {@link BrowserContext}
 * @version 1.0
 */
function BrowserContext(id, url, browser) {
	this.id = id;
	this.url = url;
	this.browser = browser;
	this.is_destroyed = false;
	this.is_loaded = false;
	this.compilationUnits = {}; // map of URL to compilation unit
}

//---- API ----

/**
 * Returns the unique identifier of this context.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns context identifier as a {@link String}
 */
BrowserContext.prototype.getId = function() {
	return this.id;
};

/**
 * Returns the URL associated with this context.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns URL as a {@link String}
 */
BrowserContext.prototype.getURL = function() {
	return this.url;
};

/**
 * Returns the browser this context is contained in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link Browser}
 */
BrowserContext.prototype.getBrowser = function() {
	return this.browser;
};

/**
 * Returns whether this browser context currently exists. Returns <code>false</code>
 * if this context has been destroyed.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this context currently exists
 */
BrowserContext.prototype.exists = function() {
	return !this.is_destroyed;
};

/**
 * Returns whether this browser context has completed loading. Returns <code>true</code>
 * if all compilation units referenced by this context have been loaded, otherwise
 * <code>false</code>.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this context has completed loading
 */
BrowserContext.prototype.isLoaded = function() {
	return this.is_loaded;
};

/**
 * Requests all JavaScript compilation units that have been compiled (loaded) in this context
 * asynchronously. Compilation units will be retrieved from the browser (if required) and
 * reported to the listener function when available. The listener function may be called before or
 * after this function returns.
 * 
 * @function
 * @param listener a function that accepts an array of {@link CompilationUnit}'s.
 */
BrowserContext.prototype.getCompilationUnits = function(listener) {
	// TODO:
};

/**
 * Returns the {@link CompilationUnit} associated with the specified URL or <code>null</code>
 * if none.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @param url the URL a script is requested for
 * @returns a {@link CompilationUnit} or <code>null</code>
 */
BrowserContext.prototype.getCompilationUnit = function(url) {
	return this.compilationUnits[url];
};

/**
 * Returns the JavaScript execution context associated with this browser context
 * or <code>null</code> if none.
 * 
 * @function
 * @returns a {@link JavaScriptContext} or <code>null</code>
 */
BrowserContext.prototype.getJavaScriptContext = function() {
	// TODO:
}

// ----- PRIVATE -----

/**
 * Notification this context has been destroyed. Clients should not call
 * this function. This function is called by the {@link Browser} implementation
 * of _contextDestroyed(..). Clients should call Browser._contextDestroyed(...)
 * when a context is destroyed.
 * 
 * @function
 */
BrowserContext.prototype._destroyed = function() {
	this.is_destroyed = true;
}

/**
 * Notification this context has been destroyed. Clients should not call
 * this function. This function is called by the {@link Browser} implementation
 * of _contextLoaded(..). Clients should call Browser._contextLoaded(...)
 * when a context has completed loading.
 * 
 * @function
 */
BrowserContext.prototype._loaded = function() {
	this.is_loaded = true;
}

/**
 * Adds the given compilation unit to the collection of compilation units in this execution context.
 * Sends 'onScript' notification. Subclasses should call the method when a script has been
 * created/added in the context. It should only be called once per script. Has no effect if
 * a script with an identical URL has already been added.
 * 
 * @function
 * @param compilationUnit a {@link CompilationUnit}
 */
BrowserContext.prototype._addCompilationUnit = function(compilationUnit) {
	if (!this.compilationUnits[compilationUnit.getURL()]) {
		this.compilationUnits[compilationUnit.getURL()] = compilationUnit;
		this.getBrowser()._dispatch("onScript", [compilationUnit]);
	}
};

/**
 * Returns a copy of the compilation units known to this execution context in an array.
 * 
 * @function
 * @returns array of {@link CompilationUnit}
 */
BrowserContext.prototype._getCompilationUnits = function() {
	var copyScripts = [];
	for (var url in this.compilationUnits) {
		copyScripts.push(this.compilationUnits[url]);
	}
	return copyScripts;
};
