function runTest()
{
    FBTest.openNewTab(basePath + "css/5644/issue5644.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(sel)
            {
                var sidePanel = FBTest.selectSidePanel("css");

                var iterateFirstRule = function(callback)
                {
                    var firstRule = sidePanel.panelNode.querySelector(".cssRule");
                    if (!firstRule)
                        FBTest.ok(false, "There must be at least one rule.");
                    var props = firstRule.getElementsByClassName("cssProp");
                    for (var i = 0; i < props.length; ++i)
                    {
                        var prop = props[i];
                        var isDisabled = prop.classList.contains("disabledStyle");
                        var name = prop.getElementsByClassName("cssPropName")[0];
                        var value = prop.getElementsByClassName("cssPropValue")[0];
                        name = name ? name.textContent : "<no name>";
                        value = value ? value.textContent : "<no value>";
                        callback(prop, name, value, isDisabled);
                    }
                };

                var verify = function(callback, disabled, enabled)
                {
                    iterateFirstRule(function(prop, name, value, isDisabled)
                    {
                        var wantedValue = enabled[name] || disabled[name];
                        if (wantedValue)
                        {
                            var shouldBeDisabled = !!disabled[name];
                            delete enabled[name];
                            delete disabled[name];
                            FBTest.compare(shouldBeDisabled, isDisabled,
                                "Property \"" + name + "\" must be " + dis(shouldBeDisabled));
                            FBTest.compare(wantedValue, value,
                                "Property \"" + name + "\" must have value \"" + wantedValue + "\"");
                        }
                        else
                        {
                            FBTest.ok(false, "Property \"" + name +
                                "\" (value \"" + value + "\", " + dis(isDisabled) + ") should not exist!");
                        }
                    });

                    for (var extraProp in disabled)
                        FBTest.ok(false, "Should have disabled property \"" + extraProp + "\"");
                    for (var extraProp in enabled)
                        FBTest.ok(false, "Should have enabled property \"" + extraProp + "\"");

                    callback();
                };

                var findProperty = function(wantedName)
                {
                    var found;
                    iterateFirstRule(function(prop, name)
                    {
                        if (name === wantedName)
                            found = prop;
                    });
                    if (!found)
                        FBTest.ok(false, "Property " + wantedName + " must exist");
                    return found;
                };

                var toggleDisable = function(callback, name)
                {
                    FBTest.progress("Disabling \"" + name + "\"");
                    var prop = findProperty(name);

                    // Try to hit the disable button.
                    FBTest.synthesizeMouse(prop, 4, 4);
                    callback();
                };

                var gc = function(callback)
                {
                    // If we switch to WeakMap, this is to confirm that it doesn't
                    // randomly drop disabled properties after a GC.
                    FBTest.progress("Running garbage collection.");
                    Components.utils.schedulePreciseGC(callback);
                };

                var renameRule = function(callback)
                {
                    FBTest.progress("Renaming rule \"#element1\" → \"p#element1\"");
                    var firstRule = sidePanel.panelNode.querySelector(".cssRule");
                    if (!firstRule)
                        FBTest.ok(false, "There must be at least one rule.");
                    var selectors = firstRule.getElementsByClassName("cssSelector");
                    FBTest.compare(1, selectors.length, "There must be one CSS selector");
                    var selector = selectors.item(0);

                    FBTest.synthesizeMouse(selector);
                    var editor = sidePanel.panelNode.querySelector(".textEditorInner");
                    FBTest.ok(editor, "Editor must be available now");
                    typeValue(editor, "p#element1");

                    // Stop inline editing
                    FBTest.synthesizeMouse(editor, -2, -2);

                    sidePanel.refresh();
                    callback();
                };

                var addProperty = function(callback, name, value, accept)
                {
                    FBTest.progress("Adding property \"" + name + "\": \"" + value + "\"" +
                        (accept ? "" : ", then reverting"));

                    var lastProp;
                    iterateFirstRule(function(prop) { lastProp = prop; });
                    var valueEl = lastProp.getElementsByClassName("cssPropValue")[0];

                    FBTest.synthesizeMouse(valueEl);
                    var editor = sidePanel.panelNode.querySelector(".textEditorInner");
                    FBTest.ok(editor, "Editor must be available now");

                    FBTest.synthesizeKey("VK_RETURN", null, win);
                    typeValue(editor, name);
                    FBTest.synthesizeKey("VK_RETURN", null, win);
                    typeValue(editor, value);
                    FW.Firebug.Editor.update(true);

                    if (accept)
                        FBTest.synthesizeKey("VK_RETURN", null, win);
                    FBTest.synthesizeKey("VK_ESCAPE", null, win);

                    sidePanel.refresh();
                    callback();
                };

                var changeProperty = function(callback, name, value, accept)
                {
                    FBTest.progress("Setting property \"" + name + "\" to \"" + value + "\"" +
                        (accept ? "" : ", then reverting"));
                    var prop = findProperty(name);
                    var valueEl = prop.getElementsByClassName("cssPropValue")[0];

                    FBTest.synthesizeMouse(valueEl);
                    var editor = sidePanel.panelNode.querySelector(".textEditorInner");
                    FBTest.ok(editor, "Editor must be available now");
                    typeValue(editor, value);
                    FW.Firebug.Editor.update(true);

                    if (accept)
                        FBTest.synthesizeKey("VK_RETURN", null, win);
                    FBTest.synthesizeKey("VK_ESCAPE", null, win);

                    sidePanel.refresh();
                    callback();
                };

                var addInlineStyle = function(callback, prop, value)
                {
                    FBTest.progress("Adding \"" + prop + "\": \"" + value + "\" as an inline style");
                    var contentEl = win.document.getElementById("element1");
                    contentEl.style[prop] = value;

                    sidePanel.refresh();
                    callback();
                };

                var deleteProperty = function(callback, name)
                {
                    var prop = findProperty(name);
                    FBTest.executeContextMenuCommand(prop, "fbDeleteCSSProp", function()
                    {
                        sidePanel.refresh();
                        callback();
                    });
                };

                var tasks = new FBTest.TaskList();
                tasks.push(verify, {}, {"color": "#700020", "font": "1em Verdana"});
                tasks.push(toggleDisable, "color");
                tasks.push(toggleDisable, "font");
                tasks.push(verify, {"color": "#700020", "font": "1em Verdana"}, {});
                tasks.push(gc);
                tasks.push(renameRule);
                tasks.push(verify, {"color": "#700020", "font": "1em Verdana"}, {});
                tasks.push(addProperty, "color", "gray", false);
                tasks.push(verify, {"color": "#700020", "font": "1em Verdana"}, {});
                tasks.push(addProperty, "color", "gray", true);
                tasks.push(verify, {"font": "1em Verdana"}, {"color": "gray"});
                tasks.push(changeProperty, "font", "1em Times New Roman", false);
                tasks.push(verify, {"font": "1em Verdana"}, {"color": "gray"});
                tasks.push(changeProperty, "font", "1em Times New Roman", true);
                tasks.push(verify, {}, {"color": "gray", "font": "1em Times New Roman"});
                tasks.push(toggleDisable, "color");
                tasks.push(addInlineStyle, "padding", "1px");
                tasks.push(verify, {}, {"padding": "1px"});
                tasks.push(toggleDisable, "padding");
                tasks.push(verify, {"padding": "1px"}, {});
                tasks.push(addInlineStyle, "margin", "1px");
                tasks.push(gc);
                tasks.push(verify, {"padding": "1px"}, {"margin": "1px"});
                tasks.push(deleteProperty, "margin");
                tasks.push(verify, {"padding": "1px"}, {});
                tasks.push(deleteProperty, "padding");
                tasks.push(verify, {"color": "gray"}, {"font": "1em Times New Roman"});
                tasks.push(deleteProperty, "font");
                tasks.push(verify, {"color": "gray"}, {});

                tasks.run(function()
                {
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}

// Optimized version of FBTest.sendString
function typeValue(editor, value)
{
    editor.value = value.slice(0, -1);
    FBTest.sendString(value.slice(-1), editor);
}

function dis(disabled)
{
    return (disabled ? "disabled" : "enabled");
}
