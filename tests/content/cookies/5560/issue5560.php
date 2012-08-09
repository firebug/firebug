<?php
    setcookie("TestCookie5560", "#", time() + 86400, dirname($_SERVER['SCRIPT_NAME']));
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Issue 5560: Add column for raw value</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=5560">Issue 5560</a>: Add column for raw value</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Cookies</em> panel</li>
                    <li>
                        Reload the page<br/>
                        <span class="ok">&rArr; One cookie should be listed (<code>TestCookie5560</code>)</span>
                    </li>
                    <li>Right-click the cookie list header and chosse <em>Raw Value</em> from the context menu</li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>The column <em>Raw Value</em> should be displayed.</li>
                    <li>The raw value for the <code>TestCookie5560</code> cookie should be <code>%23</code>.</li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
