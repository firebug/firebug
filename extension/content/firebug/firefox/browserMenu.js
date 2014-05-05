/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firefox/browserOverlayLib",
],
function(FBTrace, BrowserOverlayLib) {

// ********************************************************************************************* //
// Constants

var {$menupopupOverlay, $, $menupopup, $menu, $menuseparator, $menuitem, $el} = BrowserOverlayLib;

var Cu = Components.utils;

var xpcomUtilsScope = {};
Cu.import("resource://gre/modules/XPCOMUtils.jsm", xpcomUtilsScope);

xpcomUtilsScope.XPCOMUtils.defineLazyModuleGetter(this, "ShortcutUtils",
  "resource://gre/modules/ShortcutUtils.jsm");

var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// GlobalCommands Implementation

var BrowserMenu =
{
    overlay: function(doc)
    {
        this.overlayStartButtonMenu(doc);
        this.overlayFirebugMenu(doc);
        this.overlayFirefoxMenu(doc);
        this.overlayPanelUIMenu(doc);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Start Button Popup Menu

    overlayStartButtonMenu: function(doc)
    {
        $menupopupOverlay(doc, $(doc, "mainPopupSet"), [
            $menupopup(doc,
            {
                id: "fbStatusContextMenu",
                onpopupshowing: "Firebug.browserOverlay.onOptionsShowing(this)"
            },
            [
                $menu(doc,
                {
                    label: "firebug.uiLocation",
                    tooltiptext: "firebug.menu.tip.UI_Location"
                },
                [
                    $menupopup(doc, {
                        onpopupshowing: "Firebug.browserOverlay.onPositionPopupShowing(this)"
                    })
                ]),
                $menuseparator(doc),
                $menuitem(doc, {
                    id: "menu_firebug_ClearConsole",
                    label: "firebug.ClearConsole",
                    tooltiptext: "firebug.ClearTooltip",
                    command: "cmd_firebug_clearConsole",
                    key: "key_firebug_clearConsole"
                }),
                $menuitem(doc, {
                    id: "menu_firebug_showErrorCount",
                    type: "checkbox",
                    label: "firebug.Show_Error_Count",
                    tooltiptext: "firebug.menu.tip.Show_Error_Count",
                    oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                    option: "showErrorCount"
                }),
                $menuseparator(doc),
                $menuitem(doc, {
                    id: "menu_firebug_enablePanels",
                    label: "firebug.menu.Enable_All_Panels",
                    tooltiptext: "firebug.menu.tip.Enable_All_Panels",
                    command: "cmd_firebug_enablePanels"
                }),
                $menuitem(doc, {
                    id: "menu_firebug_disablePanels",
                    label: "firebug.menu.Disable_All_Panels",
                    tooltiptext: "firebug.menu.tip.Disable_All_Panels",
                    command: "cmd_firebug_disablePanels"
                }),
                $menuseparator(doc),
                $menuitem(doc, {
                    id: "menu_firebug_AllOn",
                    type: "checkbox",
                    label: "On_for_all_web_pages",
                    tooltiptext: "firebug.menu.tip.On_for_all_Web_Sites",
                    command: "cmd_firebug_allOn",
                    option: "allPagesActivation"
                }),
                $menuitem(doc, {
                    id: "menu_firebug_clearActivationList",
                    label: "firebug.menu.Clear_Activation_List",
                    tooltiptext: "firebug.menu.tip.Clear_Activation_List",
                    command: "cmd_firebug_clearActivationList"
                })
            ])
        ]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Global Menu

    /**
     * There are more instances of Firebug Menu (e.g. one in Firefox -> Tools -> Web Developer
     * and one in Firefox 4 (top-left orange button menu) -> Web Developer
     *
     * If extensions want to override the menu they need to iterate all existing instance
     * using document.querySelectorAll(".fbFirebugMenuPopup") and append new menu items to all
     * of them. Iteration must be done in the global space (browser.xul)
     *
     * The same menu is also used for Firebug Icon Menu (Firebug's toolbar). This menu is cloned
     * and initialized as soon as Firebug UI is actually loaded. Since it's cloned from the original
     * (global scope) extensions don't have to extend it (possible new menu items are already there).
     */
    overlayFirebugMenu: function(doc)
    {
        this.firebugMenuContent =
        [
            // Open/close Firebug
            $menuitem(doc,
            {
                id: "menu_firebug_toggleFirebug",
                label: "firebug.ShowFirebug",
                tooltiptext: "firebug.menu.tip.Open_Firebug",
                command: "cmd_firebug_toggleFirebug",
                key: "key_firebug_toggleFirebug"
            }),
            $menuitem(doc,
            {
                id: "menu_firebug_closeFirebug",
                label: "firebug.Deactivate_Firebug",
                tooltiptext: "firebug.tip.Deactivate_Firebug",
                command: "cmd_firebug_closeFirebug",
                key: "key_firebug_closeFirebug"
            }),

            // Firebug UI position
            $menu(doc,
            {
                label: "firebug.uiLocation",
                tooltiptext: "firebug.menu.tip.UI_Location"
            },
            [
                $menupopup(doc, {
                    onpopupshowing: "Firebug.browserOverlay.onPositionPopupShowing(this)"
                })
            ]),

            $menuseparator(doc),

            // External Editors
            $menu(doc,
            {
                id: "FirebugMenu_OpenWith",
                label: "firebug.OpenWith",
                tooltiptext: "firebug.menu.tip.Open_With",
                insertafter: "menu_firebug_openActionsSeparator",
                openFromContext: "true",
                command: "cmd_firebug_openInEditor"
            },
            [
                $menupopup(doc, {id: "fbFirebugMenu_OpenWith",
                    onpopupshowing: "return Firebug.browserOverlay.onEditorsShowing(this);"})
            ]),

            // Text Size
            $menu(doc,
            {
                id: "FirebugMenu_TextSize",
                label: "firebug.TextSize",
                tooltiptext: "firebug.menu.tip.Text_Size"
            },
            [
                $menupopup(doc, {},
                [
                    $menuitem(doc,
                    {
                        id: "menu_firebug_increaseTextSize",
                        label: "firebug.IncreaseTextSize",
                        tooltiptext: "firebug.menu.tip.Increase_Text_Size",
                        command: "cmd_firebug_increaseTextSize",
                        key: "key_firebug_increaseTextSize"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_decreaseTextSize",
                        label: "firebug.DecreaseTextSize",
                        tooltiptext: "firebug.menu.tip.Decrease_Text_Size",
                        command: "cmd_firebug_decreaseTextSize",
                        key: "key_firebug_decreaseTextSize"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_normalTextSize",
                        label: "firebug.NormalTextSize",
                        tooltiptext: "firebug.menu.tip.Normal_Text_Size",
                        command: "cmd_firebug_normalTextSize",
                        key: "key_firebug_normalTextSize"
                    }),
                ])
            ]),

            // Options
            $menu(doc,
            {
                id: "FirebugMenu_Options",
                label: "firebug.Options",
                tooltiptext: "firebug.menu.tip.Options"
            },
            [
                $menupopup(doc,
                {
                    id: "FirebugMenu_OptionsPopup",
                    onpopupshowing: "return Firebug.browserOverlay.onOptionsShowing(this);"
                },
                [
                    $menuitem(doc,
                    {
                        id: "menu_firebug_toggleShowErrorCount",
                        type: "checkbox",
                        label: "firebug.Show_Error_Count",
                        tooltiptext: "firebug.menu.tip.Show_Error_Count",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "showErrorCount"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_showTooltips",
                        type: "checkbox",
                        label: "firebug.menu.Show_Info_Tips",
                        tooltiptext: "firebug.menu.tip.Show_Info_Tips",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "showInfoTips"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_shadeBoxModel",
                        type: "checkbox",
                        label: "ShadeBoxModel",
                        tooltiptext: "inspect.option.tip.Shade_Box_Model",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "shadeBoxModel"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_showQuickInfoBox",
                        type: "checkbox",
                        label: "ShowQuickInfoBox",
                        tooltiptext: "inspect.option.tip.Show_Quick_Info_Box",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "showQuickInfoBox"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_enableA11y",
                        type: "checkbox",
                        label: "firebug.menu.Enable_Accessibility_Enhancements",
                        tooltiptext: "firebug.menu.tip.Enable_Accessibility_Enhancements",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "a11y.enable"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_activateSameOrigin",
                        type: "checkbox",
                        label: "firebug.menu.Activate_Same_Origin_URLs2",
                        tooltiptext: "firebug.menu.tip.Activate_Same_Origin_URLs",
                        oncommand: "Firebug.browserOverlay.onToggleOption(this)",
                        option: "activateSameOrigin"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_toggleOrient",
                        type: "checkbox",
                        label: "firebug.menu.Vertical_Panels",
                        tooltiptext: "firebug.menu.tip.Vertical_Panels",
                        command: "cmd_firebug_toggleOrient",
                        option: "viewPanelOrient"
                    }),
                    $menuseparator(doc, {id: "menu_firebug_optionsSeparator"}),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_resetAllOptions",
                        label: "firebug.menu.Reset_All_Firebug_Options",
                        tooltiptext: "firebug.menu.tip.Reset_All_Firebug_Options",
                        command: "cmd_firebug_resetAllOptions"
                    }),
                ])
            ]),

            $menuseparator(doc, {id: "FirebugBetweenOptionsAndSites", collapsed: "true"}),

            // Sites
            $menu(doc,
            {
                id: "FirebugMenu_Sites",
                label: "firebug.menu.Firebug_Online",
                tooltiptext: "firebug.menu.tip.Firebug_Online"
            },
            [
                $menupopup(doc, {},
                [
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugUrlWebsite",
                        label: "firebug.Website",
                        tooltiptext: "firebug.menu.tip.Website",
                        oncommand: "Firebug.chrome.visitWebsite('main')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugUrlExtensions",
                        label: "firebug.menu.Extensions",
                        tooltiptext: "firebug.menu.tip.Extensions",
                        oncommand: "Firebug.chrome.visitWebsite('extensions')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugHelp",
                        label: "firebug.help",
                        tooltiptext: "firebug.menu.tip.help",
                        command: "cmd_firebug_openHelp",
                        key: "key_firebug_help"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugDoc",
                        label: "firebug.Documentation",
                        tooltiptext: "firebug.menu.tip.Documentation",
                        oncommand: "Firebug.chrome.visitWebsite('docs')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugKeyboard",
                        label: "firebug.KeyShortcuts",
                        tooltiptext: "firebug.menu.tip.Key_Shortcuts",
                        oncommand: "Firebug.chrome.visitWebsite('keyboard')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugForums",
                        label: "firebug.Forums",
                        tooltiptext: "firebug.menu.tip.Forums",
                        oncommand: "Firebug.chrome.visitWebsite('discuss')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugIssues",
                        label: "firebug.Issues",
                        tooltiptext: "firebug.menu.tip.Issues",
                        oncommand: "Firebug.chrome.visitWebsite('issues')"
                    }),
                    $menuitem(doc,
                    {
                        id: "menu_firebug_firebugDonate",
                        label: "firebug.Donate",
                        tooltiptext: "firebug.menu.tip.Donate",
                        oncommand: "Firebug.chrome.visitWebsite('donate')"
                    }),
                ])
            ]),

            // Panel selector (see 'firebug/chrome/panelSelector' module for implementation).
            $menu(doc,
            {
                id: "FirebugMenu_PanelSelector",
                label: "firebug.panel_selector2",
                tooltiptext: "firebug.panel_selector2.tip",
                "class": "fbInternational"
            },
            [
                $menupopup(doc,
                {
                    id: "FirebugMenu_PanelSelectorPopup",
                    onpopupshowing: "return Firebug.browserOverlay.onPanelSelectorShowing(this);",
                    onpopuphiding: "return Firebug.browserOverlay.onPanelSelectorHiding(this)"
                })
            ]),

            $menuseparator(doc, {id: "menu_firebug_miscActionsSeparator", collapsed: "true"}),

            $menuseparator(doc, {id: "menu_firebug_toolsSeparator", collapsed: "true"}),

            $menuitem(doc,
            {
                id: "menu_firebug_customizeShortcuts",
                label: "firebug.menu.Customize_shortcuts",
                tooltiptext: "firebug.menu.tip.Customize_Shortcuts",
                command: "cmd_firebug_customizeFBKeys",
                key: "key_firebug_customizeFBKeys"
            }),

            $menuseparator(doc, {id: "menu_firebug_aboutSeparator"}),

            $menuitem(doc, {
                id: "menu_firebug_about",
                label: "firebug.About",
                tooltiptext: "firebug.menu.tip.About",
                oncommand: "Firebug.browserOverlay.openAboutDialog()",
                "class": "firebugAbout"
            }),
        ];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Global Menu Overlays

    overlayFirefoxMenu: function(doc)
    {
        // Firefox page context menu
        $menupopupOverlay(doc, $(doc, "contentAreaContextMenu"), [
            $menuseparator(doc),
            $menuitem(doc, {
                id: "menu_firebug_firebugInspect",
                label: "firebug.InspectElementWithFirebug",
                command: "cmd_firebug_inspect",
                "class": "menuitem-iconic"
            })
        ]);

        // Firefox view menu
        $menupopupOverlay(doc, $(doc, "menu_viewPopup"),
            [
                $menuitem(doc, {
                    id: "menu_firebug_viewToggleFirebug",
                    insertbefore: "toggle_taskbar",
                    label: "firebug.Firebug",
                    type: "checkbox",
                    key: "key_firebug_toggleFirebug",
                    command: "cmd_firebug_toggleFirebug"
                })
            ],
            {
                onpopupshowing: "return Firebug.browserOverlay.onViewMenuShowing();"
            }
        );

        // SeaMonkey view menu
        $menupopupOverlay(doc, $(doc, "menu_View_Popup"),
            [
                $menuitem(doc, {
                    id: "menu_firebug_viewToggleFirebug",
                    insertafter: "menuitem_fullScreen",
                    label: "firebug.Firebug",
                    type: "checkbox",
                    key: "key_firebug_toggleFirebug",
                    command: "cmd_firebug_toggleFirebug",
                    "class": "menuitem-iconic"
                })
            ],
            {
                onpopupshowing: "return Firebug.browserOverlay.onViewMenuShowing();"
            }
        );

        // Firefox Tools -> Web Developer Menu
        $menupopupOverlay(doc, $(doc, "menuWebDeveloperPopup"), [
            $menu(doc, {
                id: "menu_webDeveloper_firebug",
                position: 1,
                label: "firebug.Firebug",
                "class": "menu-iconic"
            }, [
                $menupopup(doc, {
                    id: "menu_firebug_firebugMenuPopup",
                    "class": "fbFirebugMenuPopup",
                    onpopupshowing: "return Firebug.browserOverlay.onMenuShowing(this, event);",
                    onpopuphiding: "return Firebug.browserOverlay.onMenuHiding(this, event);"
                })
            ]),
            $menuseparator(doc, {
                insertafter: "menu_webDeveloper_firebug"
            })
        ]);

        // Firefox Button -> Web Developer Menu
        $menupopupOverlay(doc, $(doc, "appmenu_webDeveloper_popup"), [
            $menu(doc, {
                id: "appmenu_firebug",
                position: 1,
                label: "firebug.Firebug",
                iconic: "true",
                "class": "menu-iconic"
            }, [
                $menupopup(doc, {
                    id: "appmenu_firebugMenuPopup",
                    "class": "fbFirebugMenuPopup",
                    onpopupshowing: "return Firebug.browserOverlay.onMenuShowing(this, event);",
                    onpopuphiding: "return Firebug.browserOverlay.onMenuHiding(this, event);"
                })
            ]),
            $menuseparator(doc, {
                insertafter: "appmenu_firebug"
            })
        ]);

        // Sea Monkey Tools Menu
        $menupopupOverlay(doc, $(doc, "toolsPopup"), [
            $menu(doc, {
                id: "menu_firebug",
                insertbefore: "appmenu_webConsole",
                command: "cmd_firebug_toggleFirebug",
                key: "key_firebug_toggleFirebug",
                label: "firebug.Firebug",
                "class": "menuitem-iconic"
            }, [
                $menupopup(doc, {
                    id: "toolsmenu_firebugMenuPopup",
                    "class": "fbFirebugMenuPopup",
                    onpopupshowing: "return Firebug.browserOverlay.onMenuShowing(this, event);",
                    onpopuphiding: "return Firebug.browserOverlay.onMenuHiding(this, event);"
                })
            ])
        ]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // PanelUI Overlay (Australis)

    /**
     * Append Firebug menu into the new Panel UI introduced in Firefox 29 (Australis)
     * The panel doesn't support sub-menus, so there is only an item opening/hiding Firebug UI.
     */
    overlayPanelUIMenu: function(doc)
    {
        var devButton = doc.getElementById("PanelUI-developer");
        if (!devButton)
        {
            TraceError.sysout("browserMenu.overlayPanelUIMenu; ERROR PanelUI-developer " +
                "button doesn't exist");
            return;
        }

        devButton.addEventListener("ViewShowing", function onShowing(event)
        {
            BrowserMenu.onDeveloperViewShowing(doc);
        }, true);
    },

    onDeveloperViewShowing: function(doc)
    {
        if (doc.getElementById("panelUI_firebug_menu"))
            return;

        var win = doc.defaultView;

        var collapsed = "true";
        if (win.Firebug.chrome)
        {
            var fbContentBox = win.Firebug.chrome.$("fbContentBox");
            collapsed = fbContentBox.getAttribute("collapsed");
        }

        var placement = win.Firebug.getPlacement ? win.Firebug.getPlacement() : "";

        var hiddenUI = (collapsed == "true" || placement == "minimized");
        var label = hiddenUI ? "firebug.ShowFirebug" : "firebug.HideFirebug";
        var tooltiptext = hiddenUI ? "firebug.menu.tip.Open_Firebug" :
            "firebug.menu.tip.Minimize_Firebug";

        var separator = $menuseparator(doc);
        var shortcut = doc.getElementById("key_firebug_toggleFirebug");
        var menuItem = $el(doc, "toolbarbutton", {
            id: "panelUI_firebug_menu",
            label: label,
            tooltiptext: tooltiptext,
            command: "cmd_firebug_toggleFirebug",
            key: "key_firebug_toggleFirebug",
            shortcut: ShortcutUtils.prettifyShortcut(shortcut),
            "class": "subviewbutton fbInternational"
        });

        var menuItems = doc.getElementById("PanelUI-developerItems");
        menuItems.insertBefore(separator, menuItems.children[0]);
        menuItems.insertBefore(menuItem, menuItems.children[0]);
    }
};

// ********************************************************************************************* //
// Registration

return BrowserMenu;

// ********************************************************************************************* //
});
