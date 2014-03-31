<?php
    setcookie('CopyPasteCookie', 'Test Cookie Value', 2000000000, '/dir', '', false);
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Cookie Clipboard</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1>Cookie Clipboard</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Cookies</em> panel</li>
                    <li>
                        Reload the page<br/>
                        <span class="ok">&rArr; The <em>Cookies</em> panel should list a cookie with the name <code>CopyPasteCookies</code></span>
                    </li>
                    <li>Right-click the <code>CopyPasteCookies</code> cookie and choose <em>Copy</em> from the context menu</li>
                    <li>Right-click into the panel and choose <em>Paste</em> from the context menu</li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>There should be a new cookie entered with the same values as the <code>CopyPasteCookies</code> but with the name <code>CopyPasteCookies-1</code></li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
