<?php
    $name = 'TestCookieInfo';
    $value = 'Test Cookie Value';
    $expire = time() + 86400;
    $path = '/';
    $domain = strpos($_SERVER['HTTP_HOST'], '.') === false ? $_SERVER['HTTP_HOST'] : '.'.$_SERVER['HTTP_HOST'];
    $secure = true;
    $httpOnly = true;

    setcookie($name, $value, $expire, $path, $domain, true, true);
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Cookie Entry</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
        <script type="text/javascript">
        window.addEventListener("load", function() {
            var expires = new Date(<?php echo $expire * 1000 ?>);
            var expiresElement = document.getElementById("expires");
            expiresElement.textContent = expires.toLocaleString();
        }, false);
        </script>
    </head>
    <body>
        <header>
            <h1>Cookie Entry</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Cookies</em> panel</li>
                    <li>Reload the page</li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>
                        There should be a cookie listed with the following info:<br/>
                        Name: <code><?php echo $name ?></code><br/>
                        Value: <code><?php echo $value ?></code><br/>
                        Domain: <code><?php echo $domain ?></code><br/>
                        Size: <code><?php echo (strlen($name) + strlen($value)) ?> B</code><br/>
                        Path: <code><?php echo $path ?></code><br/>
                        Expires: <code id="expires"></code><br/>
                        HttpOnly: <code><?php echo $httpOnly ? "HttpOnly" : "" ?></code><br/>
                        Secure: <code><?php echo $secure ? "Secure" : "" ?></code>
                    </li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
