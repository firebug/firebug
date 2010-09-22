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
 * Proxy to a debuggable web browser. A browser may be remote and contain one or more
 * JavaScript execution contexts. Each JavaScript execution context may contain one or
 * more compilation units. A browser provides notification to registered listeners describing
 * events that occur in the browser.
 * 
 * @constructor
 * @type Browser
 * @return a new Browser
 * @version 1.0
 */
function Browser() {
	this.contexts = {}; // map of contexts, indexed by conext ID
	this.activeContext = null;
	this.handlers = {}; // map of event types to array of handler functions
	this.EVENT_TYPES = ["onBreak", "onConsoleDebug", "onConsoleError", "onConsoleInfo", "onConsoleLog",
	                    "onConsoleWarn", "onContextCreated", "onContextDestroyed", "onContextChanged", "onInspectNode",
	                    "onResume", "onSuspend", "onToggleBreakpoint", "onDisconnect"];
	this.connected = false;
}

// ---- API ----

/**
 * Returns all JavaScript execution contexts currently known to this {@link Browser}.
 * <p>
 * This function does not require communication with the remote browser.
 * </p>
 * @function
 * @returns an array of {@link JavaScriptContext}
 */
Browser.prototype.getJavaScriptContexts = function() {
	// return a copy of contexts so the master copy is not corrupted
	var knownContexts = [];
	for (var id in this.contexts) {
		knownContexts.push(this.contexts[id]);
	}
	return knownContexts;
};

/**
 * Returns the JavaScript execution context with the specified id or <code>null</code>
 * if none.
 * 
 * @function
 * @param id identifier of an {@link JavaScriptContext}
 * @returns the {@link JavaScriptContext} execution context with the specified id or <code>null</code>
 * 
 */
Browser.prototype.getJavaScriptContext = function(id) {
	var context = this.contexts[id];
	if (context) {
		return context;
	}
	return null;
};

/**
 * Returns the JavaScript execution context that currently has focus in the browser
 * or <code>null</code> if none.
 * 
 * @function
 * @returns the active {@link JavaScriptContext} or <code>null</code>
 */
Browser.prototype.getActiveJavaScriptContext = function() {
	return this.activeContext;
};

/**
 * Returns whether this proxy is currently connected to the underlying browser it
 * represents.
 * 
 *  @function
 *  @returns whether connected to the underlying browser
 */
Browser.prototype.isConnected = function() {
	return this.connected;
};

/**
 * Registers a listener (function) for a specific type of event.
 * <p>
 * The supported event types and associated listener function signatures summarized in the
 * following table.
 * </p>
 * <p>
 * <table border="1">
 * <tr>
 *   <th>Event Type</th>
 *   <th>Listener Function</th>
 *   <th>Description</th>
 * </tr>
 * <tr>
 *   <td>onBreak</td>
 *   <td>function({@link CompilationUnit}, lineNumber)</td>
 *   <td>specified execution context has suspended execution</td>
 * </tr>
 * <tr>
 *   <td>onConsoleDebug</td>
 *   <td>TODO</td>
 *   <td>TODO</td>
 * </tr>
 * <tr>
 *   <td>onConsoleError</td>
 *   <td>TODO</td>
 *   <td>TODO</td>
 * </tr>
 * <tr>
 *   <td>onConsoleInfo</td>
 *   <td>function({@link JavaScriptContext}, messages[])</td>
 *   <td>specified information messages have been written by the specified JavaScript execution context</td>
 * </tr>
 * <tr>
 *   <td>onConsoleLog</td>
 *   <td>function({@link JavaScriptContext}, messages[])</td>
 *   <td>specified log messages have been written by the specified JavaScript execution context</td>
 * </tr>
 * <tr>
 *   <td>onConsoleWarn</td>
 *   <td>function({@link JavaScriptContext}, messages[])</td>
 *   <td>specified warning messages have been written by the specified JavaScript execution context</td>
 * </tr>
 * <tr>
 *   <td>onContextCreated</td>
 *   <td>function({@link JavaScriptContext})</td>
 *   <td>specified execution context has been created</td>
 * </tr>
 * <tr>
 *   <td>onContextChanged</td>
 *   <td>function({@link JavaScriptContext}, {@link JavaScriptContext})</td>
 *   <td>notification the active context has changed from the first to the latter - either argument
 *      may be <code>null</code></td>
 * </tr>
 * <tr>
 *   <td>onContextDestroyed</td>
 *   <td>function({@link JavaScriptContext})</td>
 *   <td>specified execution context no longer exists</td>
 * </tr>
 * <tr>
 *   <td>onDisconnect</td>
 *   <td>function({@link Browser}</td>
 *   <td>notification the connection to the remote browser has been closed</td>
 * </tr>
 * <tr>
 *   <td>onInspectNode</td>
 *   <td>TODO</td>
 *   <td>TODO</td>
 * </tr>
 * <tr>
 *   <td>onResume</td>
 *   <td>function({@link JavaScriptContext})</td>
 *   <td>specified execution context has resumed execution</td>
 * </tr>
 * <tr>
 *   <td>onScript</td>
 *   <td>function({@link CompilationUnit})</td>
 *   <td>specified compilation unit has been compiled (loaded)</td>
 * </tr>
 * <tr>
 *   <td>onToggleBreakpoint</td>
 *   <td>function({@link JavaScriptContext}, {@link Breakpoint})</td>
 *   <td>TODO</td>
 * </tr>
 * </table>
 * </p>
 * <p>
 * <ul>
 * <li>TODO: how can clients remove (deregister) listeners?</li>
 * </ul>
 * </p>
 * @function
 * @param eventType an event type ({@link String}) listed in the above table
 * @param listener a listener (function) that handles the event
 * @exception Error if an unsupported event type is specified
 */
Browser.prototype.addEventListener = function(eventType, listener) {
	var i = this.EVENT_TYPES.indexof(eventType);
	if (i < 0) {
		// unsupported event type
		throw new Error("eventType '" + eventType + "' is not supported");
	}
	var list = this.handlers[eventType];
	if (!list) {
		list = [];
		this.handlers[eventType] = list;
	}
	list.push(listener);
};

/**
 * Disconnects this client from the browser it is associated with.
 * 
 * @function
 */
Browser.prototype.disconnect = function() {
	
}

//TODO: support to remove a listener

// ---- PRIVATE ---- Subclasses may call these functions

/**
 * Notification the given context has been added to this browser.
 * Adds the context to the list of active contexts and notifies context
 * listeners.
 * 
 * @function
 * @param context the {@link JavaScriptContext} that has been added
 */
Browser.prototype._contextCreated = function(context) {
	// if already present, don't add it again
	var id = context.getId();
	if (this.contexts[id]) {
		return;
	}
	this.contexts[id] = context;
	this._dispatch("onContextCreated", [context]);	
};

/**
 * Notification the given context has been destroyed.
 * Removes the context from the list of active contexts and notifies context
 * listeners.
 * 
 * @function
 * @param id the identifier of the {@link JavaScriptContext} that has been destroyed
 */
Browser.prototype._contextDestroyed = function(id) {
	var destroyed = this.contexts[id];
	if (destroyed) {
		destroyed._destroyed();
		delete this.contexts[id];
		this._dispatch("onContextDestroyed", [destroyed]);
	}
};

/**
 * Dispatches an event notification to all registered functions for
 * the specified event type.
 * 
 * @param eventType event type
 * @param arguments arguments to be applied to handler functions
 */
Browser.prototype._dispatch = function(eventType, arguments) {
	functions = this.handlers[eventType];
	if (functions) {
		for ( var i = 0; i < functions.length; i++) {
			functions[i].apply(null, arguments);
		}
	}
};

/**
 * Sets the currently active JavaScript execution context, possibly <code>null</code>.
 * 
 * @function
 * @param context a {@link JavaScriptContext} or <code>null</code>
 */
Browser.prototype._setActiveContext = function(context) {
	var prev = this.activeContext;
	this.activeContext = context;
	if (prev != context) {
		this._dispatch("onContextChanged", [prev, this.activeContext]);
	}
};

/**
 * Sets whether this proxy is connected to its underlying browser.
 * Sends 'onDisconnect' notification when the browser becomes disconnected.
 * 
 * @function
 * @param connected whether this proxy is connected to its underlying browser
 */
Browser.prototype._setConnected = function(connected) {
	var wasConnected = this.connected;
	this.connected = connected;
	if (wasConnected && !connected) {
		this._dispatch("onDisconnect", [this]);
	}

}

