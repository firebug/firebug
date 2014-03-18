<?php
    header("Set-Cookie: issue6535=Hello Firebug user!; Max-Age=123456");
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6535: Show Max-Age for cookies in Net panel</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6535">Issue 6535</a>: Show Max-Age for cookies in Net panel</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Net</em> panel</li>
                    <li>Reload the page</li>
                    <li>
                        Expand the request to <em>issue6535.php</em><br/>
                        <span class="ok">&rArr; There should be a <em>Cookies</em> tab.</span>
                    </li>
                    <li>
                        There should be a <em>Max. Age</em> column showing the value of the <code>Max-Age</code> attribute
                        in a readable time format.
                    </li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
            <footer>Jan Odvarko, odvarko@gmail.com</footer>
        </div>
    </body>
</html>
