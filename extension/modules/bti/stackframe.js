/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["StackFrame"];

// ************************************************************************************************
// StackFrame

/**
 * Describes a stack frame in a JavaScript execution context.
 *
 * @constructor
 * @param index frame index (0 indicates the top frame)
 * @param stack the {@link JavaScriptStack} the frame is contained in
 * @param compilationUnit the {@link CompilationUnit} this frame is associated with
 * @param functionName the name of the function the frame is associated with - a {@link String}
 * @param lineNumber the source code line number the frame is associated with
 * @type StackFrame
 * @return a new StackFrame
 * @version 1.0
 */
function StackFrame(index, stack, compilationUnit, functionName, lineNumber)
{
    this.index = index;
    this.stack = stack;
    this.compilationUnit = compilationUnit;
    this.functionName = functionName;
    this.lineNumber = lineNumber;
}

// ************************************************************************************************
// API


/**
 * Returns the index of this frame in the current stack of frames.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns stack frame identifier as a {@link String}
 */
StackFrame.prototype.getIndex = function()
{
    return this.index;
};

/**
 * Returns the JavaScript stack this frame is contained in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link JavaScriptStack}
 */
StackFrame.prototype.getStack = function()
{
    return this.stack;
};

/**
 * Returns the compilation unit this frame is associated with.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link CompilationUnit}
 */
StackFrame.prototype.getCompilationUnit = function()
{
    return this.compilationUnit;
};

/**
 * Returns the name of the function this stack frame is executing.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns function name as a {@link String}
 */
StackFrame.prototype.getFunctionName = function()
{
    return this.functionName;
};

/**
 * Returns the line number within this stack frame's {@link CompilationUnit} that
 * is executing. This is where execution has suspended. For the top stack
 * frame, the line number represents the next line to be executed. For frames
 * deeper in the stack it represents the line that is currently executing
 * but has not yet completed.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns line number
 */
StackFrame.prototype.getLineNumber = function()
{
    return this.lineNumber;
};

/**
 * Returns the local variables currently visible in this stack frame.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the local variables currently visible in this stack frame as an array of {@link Variable}'s
 */
StackFrame.prototype.getLocals = function()
{
    // TODO: locals appear to have a name and value, but the structure of the value is not yet clear to me
};

/**
 * Returns the object associated with the 'this' keyword in this stack frame.
 *
 * @function
 * @returns the {@link ObjectReference} associated with the 'this' keyword in
 *   this stack frame
 */
StackFrame.prototype.getThis = function()
{
};

// ************************************************************************************************
// Private

// ************************************************************************************************
// CommonJS

exports = StackFrame;
