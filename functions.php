<?php
/**
 * GYOSEI MEDICAL — JIN:R Child Theme
 * Prestige × Modern brushup
 */

if (!defined('ABSPATH')) {
    exit;
}

define('GYOSEI_CHILD_VERSION', '1.3.0');

add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'jinr-parent-style',
        get_template_directory_uri() . '/style.css',
        [],
        wp_get_theme(get_template())->get('Version')
    );

    wp_enqueue_style(
        'gyosei-child-style',
        get_stylesheet_directory_uri() . '/style.css',
        ['jinr-parent-style'],
        GYOSEI_CHILD_VERSION
    );

    wp_enqueue_style(
        'gyosei-google-fonts',
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;700&family=Shippori+Mincho+B1:wght@400;500;600;700;800&display=swap',
        [],
        null
    );

    wp_enqueue_style(
        'gyosei-brushup',
        get_stylesheet_directory_uri() . '/assets/css/brushup.css',
        ['gyosei-child-style'],
        GYOSEI_CHILD_VERSION
    );

    wp_enqueue_script(
        'gyosei-brushup-js',
        get_stylesheet_directory_uri() . '/assets/js/brushup.js',
        [],
        GYOSEI_CHILD_VERSION,
        true
    );
}, 20);
