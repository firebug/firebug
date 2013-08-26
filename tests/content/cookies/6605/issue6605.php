<?php
    setrawcookie("TestCookie6605", "+", time() + 86400, dirname($_SERVER['SCRIPT_NAME']));
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6605: Incorrect cookie encoding for character &quot;+&quot;</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6605">Issue 6605</a>: Incorrect cookie encoding for character &quot;+&quot;</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>
                        Enable and switch to the <em>Cookies</em> panel<br/>
                        <span class="ok">
                            &rArr; A cookie named <code>TestCookie6605</code> should be listed and
                            the <em>Value</em> column should display a space.
                        </span>
                    </li>
                    <li>Click the cookie to expand it</li>
                    <li>
                        Switch to the <em>Raw Data</em> tab<br/>
                        <span class="ok">&rArr; The displayed value should be <code>+</code>.</span>
                    </li>
                    <li>
                        Right-click the cookie and choose <em>Edit</em> from the context menu<br/>
                        <span class="ok">
                            &rArr; The <em>Edit Cookie</em> dialog should appear again and the
                            checkbox for <em>URL encode value</em> should be unchecked.
                        </span>
                    </li>
                    <li>
                        Click the <em>OK</em> button<br/>
                        <span class="ok">
                            &rArr; The <em>Value</em> column should still display a space.
                        </span>
                    </li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>"+" characters should not be URL encoded automatically when editing a cookie.</li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
