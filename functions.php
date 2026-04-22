<?php
/**
 * GYOSEI MEDICAL — JIN:R Child Theme
 * Prestige × Modern brushup
 */

if (!defined('ABSPATH')) {
    exit;
}

define('GYOSEI_CHILD_VERSION', '1.37.0');

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

/* =========================================================================
 * SEO / GEO enhancements
 * ========================================================================= */

define('GYOSEI_SITE_NAME', 'GYOSEI MEDICAL');
define('GYOSEI_SITE_TAGLINE', '暁星卒業生OB医師の病院・クリニック開業情報サイト');
define('GYOSEI_SITE_DESC', '暁星学園を卒業され病院およびクリニックを開業されているOB医師の情報ポータル。診療科目、エリア、卒業年代から信頼できる医療機関を探せる暁星OB医師ネットワーク。');
define('GYOSEI_OGP_IMAGE', 'https://gyosei-medical.com/wp-content/uploads/2025/03/GYOSEI-MEDICAL-logo_perfect-2.png');
define('GYOSEI_CONTACT_EMAIL', 'info@gyosei-medical.com');

/**
 * Strip empty meta description tags output by the parent theme,
 * then our own richer tags run later via wp_head hook.
 */
add_action('wp_head', function () { ob_start(); }, 0);
add_action('wp_head', function () {
    $head = ob_get_clean();
    if (is_string($head) && $head !== '') {
        $head = preg_replace(
            '/<meta\s+name=["\']description["\']\s+content=["\']\s*["\']\s*\/?>\s*/i',
            '',
            $head
        );
        echo $head;
    }
}, PHP_INT_MAX);

/**
 * Build title/description/image/url context for the current page.
 */
function gyosei_seo_context() {
    $ctx = [
        'title'       => GYOSEI_SITE_NAME . ' | ' . GYOSEI_SITE_TAGLINE,
        'description' => GYOSEI_SITE_DESC,
        'image'       => GYOSEI_OGP_IMAGE,
        'url'         => home_url('/'),
        'type'        => 'website',
    ];

    if (is_front_page() || is_home()) {
        // defaults above
    } elseif (is_singular('post')) {
        $clinic_title = get_the_title();
        $cats = get_the_category();
        $specialty = !empty($cats) ? $cats[0]->name : null;
        $area = null;
        $grad = null;
        // Custom taxonomies for area + graduation year (TCD uses separate category taxonomies)
        $tax_area = get_the_terms(get_the_ID(), 'category2');
        if (!is_wp_error($tax_area) && !empty($tax_area)) { $area = $tax_area[0]->name; }
        $tax_grad = get_the_terms(get_the_ID(), 'category3');
        if (!is_wp_error($tax_grad) && !empty($tax_grad)) { $grad = $tax_grad[0]->name; }

        $desc_parts = ['暁星学園OB医師が開業する「' . $clinic_title . '」の情報。'];
        if ($specialty) $desc_parts[] = '診療科目：' . $specialty . '。';
        if ($area) $desc_parts[] = 'エリア：' . $area . '。';
        if ($grad) $desc_parts[] = '院長暁星卒業年代：' . $grad . '。';
        $desc_parts[] = 'GYOSEI MEDICALは暁星卒業生OB医師の病院・クリニックを集約する情報サイトです。';

        $ctx['title']       = $clinic_title . ' | ' . GYOSEI_SITE_NAME;
        $ctx['description'] = mb_substr(implode('', $desc_parts), 0, 160);
        $thumb = get_the_post_thumbnail_url(null, 'full');
        if ($thumb) $ctx['image'] = $thumb;
        $ctx['url']  = get_permalink();
        $ctx['type'] = 'article';
    } elseif (is_page()) {
        $ctx['title']       = get_the_title() . ' | ' . GYOSEI_SITE_NAME;
        $ctx['description'] = wp_strip_all_tags(get_the_excerpt()) ?: GYOSEI_SITE_DESC;
        $ctx['description'] = mb_substr($ctx['description'], 0, 160);
        $ctx['url']         = get_permalink();
        $ctx['type']        = 'article';
    } elseif (is_category() || is_tax() || is_archive()) {
        $obj = get_queried_object();
        $name = is_object($obj) && !empty($obj->name) ? $obj->name : '一覧';
        $ctx['title']       = $name . ' | ' . GYOSEI_SITE_NAME;
        $ctx['description'] = $name . 'に該当する暁星OB医師の病院・クリニック一覧。診療科目、エリア、卒業年代から検索できる暁星OB医師ネットワーク。';
        $ctx['url']         = is_object($obj) ? get_term_link($obj) : home_url('/');
    } elseif (is_search()) {
        $q = get_search_query();
        $ctx['title']       = '「' . $q . '」の検索結果 | ' . GYOSEI_SITE_NAME;
        $ctx['description'] = '「' . $q . '」に該当する暁星OB医師の病院・クリニック検索結果。';
    }
    return $ctx;
}

/**
 * Inject OGP, Twitter Card, and a meta description.
 * Suppressed when Rank Math SEO is active to avoid duplicate tags.
 */
add_action('wp_head', function () {
    if (defined('RANK_MATH_VERSION')) return;
    $ctx = gyosei_seo_context();
    $title = esc_attr($ctx['title']);
    $desc  = esc_attr($ctx['description']);
    $image = esc_url($ctx['image']);
    $url   = esc_url($ctx['url']);
    $type  = esc_attr($ctx['type']);

    echo "\n<!-- GYOSEI MEDICAL SEO -->\n";
    echo '<meta name="description" content="' . $desc . '">' . "\n";
    echo '<meta property="og:type" content="' . $type . '">' . "\n";
    echo '<meta property="og:title" content="' . $title . '">' . "\n";
    echo '<meta property="og:description" content="' . $desc . '">' . "\n";
    echo '<meta property="og:url" content="' . $url . '">' . "\n";
    echo '<meta property="og:image" content="' . $image . '">' . "\n";
    echo '<meta property="og:site_name" content="' . esc_attr(GYOSEI_SITE_NAME) . '">' . "\n";
    echo '<meta property="og:locale" content="ja_JP">' . "\n";
    echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
    echo '<meta name="twitter:title" content="' . $title . '">' . "\n";
    echo '<meta name="twitter:description" content="' . $desc . '">' . "\n";
    echo '<meta name="twitter:image" content="' . $image . '">' . "\n";
}, 2);

/**
 * Override the document title for legibility across AI/search engines.
 * Only when Rank Math is not handling titles.
 */
add_filter('pre_get_document_title', function ($title) {
    if (defined('RANK_MATH_VERSION')) return $title;
    $ctx = gyosei_seo_context();
    return $ctx['title'] ?: $title;
}, 20);

/**
 * Inject JSON-LD structured data for GEO (LLM/Generative Engine) discovery.
 *
 * Rank Math already outputs Organization + WebSite + BreadcrumbList, so when
 * it is active we only add our unique MedicalClinic schema (Rank Math Free
 * does not emit MedicalClinic). When Rank Math is absent, emit the full set.
 */
add_action('wp_head', function () {
    $json_flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    $rankmath_active = defined('RANK_MATH_VERSION');

    if ($rankmath_active) {
        // Rank Math handles Organization / WebSite / BreadcrumbList — only add MedicalClinic here
        if (is_singular('post')) {
            $cats = get_the_category();
            $specialty = !empty($cats) ? $cats[0]->name : null;
            $area = null;
            $tax_area = get_the_terms(get_the_ID(), 'category2');
            if (!is_wp_error($tax_area) && !empty($tax_area)) { $area = $tax_area[0]->name; }
            $thumb = get_the_post_thumbnail_url(null, 'full');

            $clinic = [
                '@context'     => 'https://schema.org',
                '@type'        => 'MedicalClinic',
                '@id'          => get_permalink() . '#clinic',
                'name'         => get_the_title(),
                'url'          => get_permalink(),
                'description'  => '暁星学園OB医師が開業する' . ($specialty ?: '医療機関') . '。GYOSEI MEDICAL掲載。',
                'parentOrganization' => [
                    '@type' => 'Organization',
                    'name'  => GYOSEI_SITE_NAME,
                    'url'   => home_url('/'),
                ],
            ];
            if ($thumb) $clinic['image'] = $thumb;
            if ($specialty) $clinic['medicalSpecialty'] = $specialty;
            if ($area) {
                $clinic['areaServed'] = [
                    '@type' => 'AdministrativeArea',
                    'name'  => $area,
                ];
            }
            echo "\n<!-- GYOSEI MedicalClinic JSON-LD -->\n";
            echo '<script type="application/ld+json">' . wp_json_encode($clinic, $json_flags) . '</script>' . "\n";
        }
        return;
    }

    // Organization (site-wide)
    $organization = [
        '@context'     => 'https://schema.org',
        '@type'        => 'Organization',
        '@id'          => home_url('/#organization'),
        'name'         => GYOSEI_SITE_NAME,
        'alternateName'=> '暁星OB医師ネットワーク',
        'url'          => home_url('/'),
        'logo'         => [
            '@type'  => 'ImageObject',
            'url'    => GYOSEI_OGP_IMAGE,
            'width'  => 800,
            'height' => 200,
        ],
        'description'  => GYOSEI_SITE_DESC,
        'email'        => GYOSEI_CONTACT_EMAIL,
        'sameAs'       => [
            'https://www.facebook.com/profile.php?id=61559697644215',
            'https://www.instagram.com/gyosei_medical/',
        ],
    ];

    // WebSite + SearchAction
    $website = [
        '@context'         => 'https://schema.org',
        '@type'            => 'WebSite',
        '@id'              => home_url('/#website'),
        'name'             => GYOSEI_SITE_NAME,
        'alternateName'    => '暁星OB医師の病院・クリニック情報サイト',
        'url'              => home_url('/'),
        'description'      => GYOSEI_SITE_DESC,
        'inLanguage'       => 'ja',
        'publisher'        => ['@id' => home_url('/#organization')],
        'potentialAction'  => [
            '@type'       => 'SearchAction',
            'target'      => [
                '@type'       => 'EntryPoint',
                'urlTemplate' => home_url('/clinic/?search_cat1={search_term_string}'),
            ],
            'query-input' => 'required name=search_term_string',
        ],
    ];

    echo "\n<!-- GYOSEI MEDICAL JSON-LD -->\n";
    echo '<script type="application/ld+json">' . wp_json_encode($organization, $json_flags) . '</script>' . "\n";
    echo '<script type="application/ld+json">' . wp_json_encode($website, $json_flags) . '</script>' . "\n";

    // MedicalClinic per individual clinic page
    if (is_singular('post')) {
        $cats = get_the_category();
        $specialty = !empty($cats) ? $cats[0]->name : null;

        $area = null;
        $tax_area = get_the_terms(get_the_ID(), 'category2');
        if (!is_wp_error($tax_area) && !empty($tax_area)) { $area = $tax_area[0]->name; }

        $thumb = get_the_post_thumbnail_url(null, 'full');

        $clinic = [
            '@context'         => 'https://schema.org',
            '@type'            => 'MedicalClinic',
            '@id'              => get_permalink() . '#clinic',
            'name'             => get_the_title(),
            'url'              => get_permalink(),
            'description'      => '暁星学園OB医師が開業する' . ($specialty ?: '医療機関') . '。GYOSEI MEDICAL掲載。',
            'parentOrganization' => [
                '@type' => 'Organization',
                'name'  => GYOSEI_SITE_NAME,
                'url'   => home_url('/'),
            ],
            'isPartOf'         => ['@id' => home_url('/#website')],
        ];
        if ($thumb) {
            $clinic['image'] = $thumb;
        }
        if ($specialty) {
            $clinic['medicalSpecialty'] = $specialty;
        }
        if ($area) {
            $clinic['areaServed'] = [
                '@type' => 'AdministrativeArea',
                'name'  => $area,
            ];
        }

        echo '<script type="application/ld+json">' . wp_json_encode($clinic, $json_flags) . '</script>' . "\n";
    }

    // BreadcrumbList everywhere except the front page
    if (!is_front_page()) {
        $items = [
            [
                '@type'    => 'ListItem',
                'position' => 1,
                'name'     => 'ホーム',
                'item'     => home_url('/'),
            ],
        ];
        $pos = 2;
        if (is_singular('post')) {
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $pos++,
                'name'     => 'クリニック一覧',
                'item'     => home_url('/clinic/'),
            ];
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $pos++,
                'name'     => get_the_title(),
                'item'     => get_permalink(),
            ];
        } elseif (is_category() || is_tax()) {
            $obj = get_queried_object();
            if ($obj) {
                $items[] = [
                    '@type'    => 'ListItem',
                    'position' => $pos++,
                    'name'     => $obj->name,
                    'item'     => get_term_link($obj),
                ];
            }
        } elseif (is_page()) {
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $pos++,
                'name'     => get_the_title(),
                'item'     => get_permalink(),
            ];
        }

        $breadcrumb = [
            '@context'        => 'https://schema.org',
            '@type'           => 'BreadcrumbList',
            'itemListElement' => $items,
        ];
        echo '<script type="application/ld+json">' . wp_json_encode($breadcrumb, $json_flags) . '</script>' . "\n";
    }
}, 3);

/**
 * Hint AI crawlers explicitly via robots meta (complement robots.txt).
 * Keeps standard max-image-preview + explicitly allows snippet generation.
 */
add_filter('wp_robots', function ($robots) {
    $robots['max-image-preview'] = 'large';
    $robots['max-snippet']       = -1;
    $robots['max-video-preview'] = -1;
    return $robots;
});

/**
 * Force HTTPS on all gyosei-medical.com asset URLs rendered into the page.
 *
 * TCD pagebuilder and some legacy post content reference images via
 * http://gyosei-medical.com/..., which modern browsers block as mixed content
 * when the page itself is served over HTTPS. That was silently killing the
 * header logo and all homepage banner images.
 *
 * We buffer the full page output and rewrite the host scheme in one pass.
 */
add_action('template_redirect', 'gyosei_force_https_buffer', 1);
function gyosei_force_https_buffer() {
    if (is_admin()) return;
    ob_start('gyosei_force_https_rewrite');
}

function gyosei_force_https_rewrite($html) {
    if (!is_string($html) || $html === '') return $html;

    // 1) Force HTTPS on gyosei-medical.com asset URLs
    $patterns = [
        'http://gyosei-medical.com/',
        'http://www.gyosei-medical.com/',
    ];
    $replace = [
        'https://gyosei-medical.com/',
        'https://www.gyosei-medical.com/',
    ];
    $html = str_replace($patterns, $replace, $html);

    // 1.5) Hero headline: insert line break after "、" for mobile legibility
    $html = str_replace(
        '暁星からつながる、安心の医療ネットワーク',
        '暁星からつながる、<br>安心の医療ネットワーク',
        $html
    );

    // 1.6) Strip `js-ellipsis` class from clinic-card doctor-name <p> so TCD's
    //      jquery.textOverflowEllipsis.js plugin cannot touch them. The plugin
    //      hooks on `.js-ellipsis` and replaces innerHTML with a truncated
    //      version (losing the `<br>(XX年卒)` line). By renaming the class
    //      server-side, the plugin's selector finds nothing to chew on.
    $html = preg_replace_callback(
        '#<p class="title js-ellipsis"([^>]*)>(.*?)</p>#us',
        function ($m) {
            $inner = $m[2];
            // Only rename if the content looks like a doctor-name line (contains
            // 年卒 or has a <br>). Clinic name titles don't contain these so
            // TCD's ellipsis on those long names is left untouched.
            if (strpos($inner, '年卒') !== false || preg_match('#<br\s*/?>#', $inner)) {
                return '<p class="title gm-preserve"' . $m[1] . '>' . $inner . '</p>';
            }
            return $m[0];
        },
        $html
    );

    // 2) On the homepage, restructure the bottom banner strip:
    //    - remove the "OB医師の方へ" banner entirely
    //    - add a .gm-home-banners class hook to the clearfix container so CSS grids it
    //    - inject a single CTA button after the banner strip
    if (strpos($html, '<!-- END #main_col -->') !== false &&
        strpos($html, 'cb_content-wysiwyg') !== false &&
        !strpos($html, 'gm-home-cta-btn')) {

        // Remove the OB医師 banner <div> (non-greedy match, no nested div inside this card)
        $html = preg_replace(
            '#<div class=""[^>]*>(?:(?!</div>).)*?OB医師(?:(?!</div>).)*?</div>\s*#us',
            '',
            $html
        );
        // Also handle URL-encoded variant just in case
        $html = preg_replace(
            '#<div class=""[^>]*>(?:(?!</div>).)*?OB%E5%8C%BB%E5%B8%AB(?:(?!</div>).)*?</div>\s*#us',
            '',
            $html
        );

        // Tag the clearfix container so CSS can grid it. TCD renders:
        //     <div id="cb_1" class="cb_content cb_content-wysiwyg">
        //         <div class="inner">
        //             <div class=" clearfix">   <-- we add gm-home-banners here
        $html = preg_replace(
            '#(<div id="cb_1"[^>]*cb_content-wysiwyg[^>]*>\s*<div class="inner">\s*<div class=")(\s*clearfix)(")#u',
            '$1$2 gm-home-banners$3',
            $html
        );

        // Inject "LINK" section heading above the banner grid (once)
        if (strpos($html, 'gm-home-link-heading') === false) {
            $html = preg_replace(
                '#(<div id="cb_1"[^>]*cb_content-wysiwyg[^>]*>\s*<div class="inner">)#u',
                '$1<div class="gm-home-link-heading"><span class="gm-home-link-heading-label">LINK</span><span class="gm-home-link-heading-sub">関連サイト</span></div>',
                $html,
                1
            );
        }

        // Tag each `<div class="">` banner child with gm-home-banner-item
        $html = preg_replace(
            '#<div class=""(\s+style="padding-bottom:\s*30px[^"]*")?>#u',
            '<div class="gm-home-banner-item"$1>',
            $html
        );

        // Rebuild each banner card individually with clean HTML.
        // Each replace is narrowly scoped to one banner's image filename so the
        // runs don't interfere with each other.
        $banner_labels = [
            '1-2.png'       => ['title' => 'GYOSEI EATS',   'sub' => '暁星OB飲食店ポータル'],
            'GYOSEI-DENTAL' => ['title' => 'GYOSEI DENTAL', 'sub' => '暁星OB歯科医師開業情報ポータル'],
            '2-2.png'       => ['title' => 'LIBUN',         'sub' => 'Reputation / webPR'],
        ];

        foreach ($banner_labels as $match_str => $label) {
            $safe = preg_quote($match_str, '#');
            $pattern =
                '#<div class="gm-home-banner-item"[^>]*>' .
                '\s*<center[^>]*>\s*<a\s+href="([^"]+)"[^>]*>\s*' .
                '<img[^>]+src="([^"]*' . $safe . '[^"]*)"[^>]*>\s*' .
                '</a>\s*</center>' .
                '(?:(?!<div class="gm-home-).)*?' .
                '</div>#us';

            $title = $label['title'];
            $sub   = $label['sub'];

            $html = preg_replace_callback(
                $pattern,
                function ($m) use ($title, $sub) {
                    $href = $m[1];
                    $src  = $m[2];
                    $is_external = (strpos($href, 'gyosei-medical.com') === false);
                    $target_attr = $is_external ? ' target="_blank" rel="noopener"' : '';
                    return '<div class="gm-home-banner-item">' .
                        '<a href="' . htmlspecialchars($href, ENT_QUOTES) . '"' . $target_attr . '>' .
                        '<img src="' . htmlspecialchars($src, ENT_QUOTES) . '" alt="' . htmlspecialchars($title, ENT_QUOTES) . '">' .
                        '</a>' .
                        '<div class="gm-banner-label">' .
                        '<span class="gm-banner-title">' . $title . '</span>' .
                        '<span class="gm-banner-sub">' . $sub . '</span>' .
                        '</div>' .
                        '</div>';
                },
                $html
            );
        }

        // Inject CTA card as the 4th item INSIDE the gm-home-banners grid.
        // The 5 closing </div>s at the end of #main_col are, in order:
        //   1) close last banner card
        //   2) close .gm-home-banners (clearfix)
        //   3) close .inner
        //   4) close #cb_1
        //   5) close #main_col
        // We inject the CTA card between 1 and 2 so it lives inside gm-home-banners.
        $cta_card =
            '<div class="gm-home-banner-item gm-home-cta-card">' .
            '<a href="/join/" class="gm-home-cta-btn">' .
            '<span class="gm-home-cta-label">掲載をご希望の方はこちら</span>' .
            '<span class="gm-home-cta-arrow">&rsaquo;</span>' .
            '</a></div>';
        $html = preg_replace(
            '#(</div>)(\s*</div>\s*</div>\s*</div>\s*</div>\s*<!-- END \#main_col -->)#u',
            '$1' . $cta_card . '$2',
            $html,
            1
        );
    }

    return $html;
}

