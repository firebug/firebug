<?php
    setcookie('cookieValue', '1 + 2 = 3', time() + 86400, '/');
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Escaped and unescaped cookie values</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1>Escaped and unescaped cookie values</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>
                        Enable and switch to the <em>Cookies</em> panel<br/>
                        <span class="ok">&rArr; The panel should list a <code>cookieValue</code> cookie.</span>
                    </li>
                    <li>
                        Right-click the <em>Cookies</em> panel column header and check <em>Raw Value</em><br/>
                        <span class="ok">
                            &rArr; The <em>Value</em> column of the <code>cookieValue</code>
                            should contain <code>1 + 2 = 3</code> and the <em>Raw Value</em> column
                            <code>1+%2B+2+%3D+3</code>.
                        </span>
                    </li>
                    <li>
                        Expand the cookie<br/>
                        <span class="ok">&rArr; The <em>Value</em> tab should display <code>1 + 2 = 3</code>.</span>
                    </li>
                    <li>
                        Switch to the <em>Raw Data</em> tab<br/>
                        <span class="ok">&rArr; The <em>Raw Data</em> tab should display <code>1+%2B+2+%3D+3</code>.</span>
                    </li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>The cookie value must be shown in its raw form and in the URL escaped form.</li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
