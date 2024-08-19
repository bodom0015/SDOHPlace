import { initSolrObject } from "meta/helper/solrObjects";
import { SolrObject } from "meta/interface/SolrObject";
import { findSolrAttribute } from "meta/helper/util";
export default class SolrQueryBuilder {
  private query: QueryObject = {
    solrUrl: process.env.NEXT_PUBLIC_SOLR_URL || "",
    query: "",
    schema_json: {},
  };

  // Method to set the basic query string. Don't call this. Call individual query methods instead.
  // TODO: if our query will have more syntax, move the select part to individual query methods
  setQuery(queryString: string): SolrQueryBuilder {
    this.query.query = `${this.query.solrUrl}/${queryString}`;
    return this;
  }
  getQuery(): string {
    return this.query.query;
  }
  getSchema(): {} {
    return this.query.schema_json;
  }
  getSolrUrl(): string {
    return this.query.solrUrl;
  }
  setSchema(schema: {}): SolrQueryBuilder {
    this.query.schema_json = schema;
    return this;
  }

  public fetchResult(): Promise<SolrObject[]> {
    return new Promise((resolve, reject) => {
      const encodedUrl = this.query.query;
      console.log("Encoded URL: ", encodedUrl);
      fetch(encodedUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.text();
        })
        .then((text) => {
          try {
            const jsonResponse = JSON.parse(text);
            const result = this.getSearchResult(jsonResponse);
            resolve(result);
          } catch (error) {
            console.error("Error parsing JSON:", error);
            if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
              console.warn("Received HTML response instead of JSON", text);
              resolve([]);
            } else {
              reject(new Error("Invalid response format"));
            }
          }
        })
        .catch((error) => {
          console.error("Error fetching data:", error);
          reject(error);
        });
    });
  }

  /**
   * Based on the response from solr, return a list of SolrObjects as the search result.
   * @param response_json object of the response from solr
   * @returns a list of SolrObjects as the search result. If no result, return empty list.
   */
  getSearchResult(response_json: any): any {
    let result = [] as SolrObject[];
    //if return suggest
    if (response_json && response_json["suggest"]) return response_json;
    //if return select
    const rawSolrObjects =
      response_json &&
      response_json["response"] &&
      response_json["response"].docs
        ? response_json["response"].docs
        : [];
    rawSolrObjects.forEach((rawSolrObject: any) => {
      result.push(initSolrObject(rawSolrObject, this.query.schema_json));
    });
    return result;
  }

  /**
   * Search Methods based on Solr syntax. Not all methods are used in the search component
   * */
  public suggestQuery(searchTerm: string): SolrQueryBuilder {
    const suggestQuery = `suggest?q=${encodeURIComponent(searchTerm)}`;
    return this.setQuery(suggestQuery);
  }
  public contentQuery(searchTerm: string): SolrQueryBuilder {
    const contentQuery = `select?q=content:"${encodeURIComponent(searchTerm)}"`;
    return this.setQuery(contentQuery);
  }
  public generalQuery(searchTerms: string | string[]): SolrQueryBuilder {
    let generalQuery = "select?q=";
    if (typeof searchTerms === "string") {
      generalQuery += `${encodeURIComponent(
        findSolrAttribute(searchTerms, this.query.schema_json)
      )}`;
    } else {
      searchTerms.forEach((term) => {
        generalQuery += `${encodeURIComponent(
          findSolrAttribute(term, this.query.schema_json)
        )} OR `;
      });
      generalQuery = generalQuery.slice(0, -4); //remove the last OR
    }
    return this.setQuery(generalQuery);
  }

  public filterQuery(
    searchTerms: { attribute: string; value: string }[]
  ): SolrQueryBuilder {
    let filterQuery = `select?fq=`;
    searchTerms.forEach((term) => {
      filterQuery += `${encodeURIComponent(
        findSolrAttribute(term.attribute, this.query.schema_json)
      )}:"${encodeURIComponent(term.value)}" AND `;
    });
    filterQuery = filterQuery.slice(0, -5); //remove the last AND
    filterQuery = filterQuery += "&rows=1000";
    return this.setQuery(filterQuery);
  }

  public sortQuery(searchTerm: {
    attribute: string;
    order: string;
  }): SolrQueryBuilder {
    if (searchTerm.order != "asc" && searchTerm.order != "desc") {
      searchTerm.order = "asc";
    } //use asc as default
    let sortQuery = `select?sort=${encodeURIComponent(
      findSolrAttribute(searchTerm.attribute, this.query.schema_json)
    )}${encodeURIComponent(" ")}${searchTerm.order}`;
    sortQuery = sortQuery += "&rows=1000"; //add rows to remove pagination
    return this.setQuery(sortQuery);
  }

  public combineQueries = (
    term,
    filterQueries,
  ): SolrQueryBuilder => {
    let combinedQuery = this.generalQuery(term).getQuery();
    if (filterQueries.length > 0) {
      let filterQuery = `&fq=`;
      filterQueries.forEach((f) => {
        filterQuery += `${encodeURIComponent(
          findSolrAttribute(f.attribute, this.getSchema())
        )}:"${encodeURIComponent(f.value)}" AND `; // for url with multiple filter values, use OR instead of AND
      });
      filterQuery = filterQuery.slice(0, -4);
      combinedQuery += filterQuery;
    }
    // add sort by detecting sortOrder and sortBy, only if both are present
    // if (
    //   sortOrder.length > 0 &&
    //   sortBy.length > 0 &&
    //   findSolrAttribute(sortBy, this.getSchema() !== undefined)
    // ) {
    //   combinedQuery += `&sort=${encodeURIComponent(
    //     findSolrAttribute(sortBy, this.getSchema())
    //   )}${encodeURIComponent(" ")}${sortOrder}`;
    // }
    combinedQuery += "&rows=1000";
    return this.setQuery(combinedQuery.replace(this.getSolrUrl() + "/", ""));
  };
}
