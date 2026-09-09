# MemeSnip Web Application Dockerfile
FROM php:8.2-apache

# Enable Apache modules (mod_rewrite, mod_headers)
RUN a2enmod rewrite headers

# Install custom PHP configurations (upload size cap, memory limit, timeouts)
COPY docker/php.ini $PHP_INI_DIR/conf.d/memesnip.ini

# Set application working directory
WORKDIR /var/www/html

# Copy application source code
COPY . /var/www/html/

# Create required storage directories and set permissions
RUN mkdir -p /var/www/html/memes /var/www/html/avatars \
    && cp -n /var/www/html/default-guest.jpg /var/www/html/avatars/default-guest.jpg 2>/dev/null || true \
    && chown -R www-data:www-data /var/www/html/memes /var/www/html/avatars \
    && chmod -R 775 /var/www/html/memes /var/www/html/avatars

# Expose HTTP port
EXPOSE 80

# Health check to monitor container responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

CMD ["apache2-foreground"]
